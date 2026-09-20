/**
 * POST /api/payments/whop/webhook
 * Source of truth for payment status. Verify signature, idempotent, match order amount.
 * Never auto-purchase CJ. Real payments only when WHOP_ENVIRONMENT=production (not default).
 */
import {
  verifyWebhookSignature,
  parseWebhookEvent,
  isSandbox,
} from '../../../lib/payments/whop.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  // Vercel may not stream — try empty
  return '';
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  if (!SERVICE) return { error: 'no service key' };
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) return { error: (data && data.message) || `sb ${r.status}`, data };
  return { data };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const rawBody = await readRawBody(req);
  const headers = req.headers || {};

  const verified = verifyWebhookSignature(rawBody, headers);
  if (!verified.ok) {
    console.error('[whop/webhook] signature fail:', verified.reason);
    return json(res, 401, { ok: false, error: 'invalid_signature' });
  }

  const event = parseWebhookEvent(rawBody);
  if (!event || !event.type) {
    return json(res, 400, { ok: false, error: 'invalid_payload' });
  }

  const eventId = verified.eventId || event.id || headers['webhook-id'];
  const eventType = String(event.type);

  // Idempotency
  if (eventId) {
    const existing = await sb(
      `payment_webhook_events?provider=eq.whop&event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`
    );
    if (Array.isArray(existing.data) && existing.data.length) {
      return json(res, 200, { ok: true, duplicate: true });
    }
  }

  const data = event.data || {};
  const metadata = data.metadata || {};
  const orderId = metadata.order_id || data.metadata?.order_id || null;
  const paymentId = data.id || null;
  const paymentStatus = String(data.status || '').toLowerCase();
  const amount = data.total != null ? Number(data.total) : data.amount != null ? Number(data.amount) : null;
  const currency = data.currency ? String(data.currency).toLowerCase() : null;

  let order = null;
  if (orderId) {
    const or = await sb(`orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
    order = Array.isArray(or.data) ? or.data[0] : null;
  }
  if (!order && metadata.order_number) {
    const or = await sb(
      `orders?order_number=eq.${encodeURIComponent(metadata.order_number)}&select=*&limit=1`
    );
    order = Array.isArray(or.data) ? or.data[0] : null;
  }

  // Log event (safe summary only)
  await sb('payment_webhook_events', {
    method: 'POST',
    body: {
      provider: 'whop',
      event_id: String(eventId || `unknown-${Date.now()}`),
      event_type: eventType,
      order_id: order?.id || null,
      payload_summary: {
        payment_id: paymentId,
        status: paymentStatus,
        amount,
        currency,
        type: eventType,
        sandbox: isSandbox(),
      },
    },
    prefer: 'return=minimal',
  });

  // Event handling — official names from Whop docs
  if (eventType === 'payment.succeeded' || (eventType === 'payment.created' && paymentStatus === 'succeeded')) {
    if (!order) {
      console.error('[whop/webhook] payment succeeded but order not found');
      return json(res, 200, { ok: true, matched: false });
    }

    // Amount check against stored Whop charge amount when available
    const expectedWhop = order.payment_meta?.whop_amount != null ? Number(order.payment_meta.whop_amount) : null;
    let amountOk = true;
    if (expectedWhop != null && amount != null) {
      amountOk = Math.abs(expectedWhop - amount) <= 0.05 || Math.abs(Number(order.total) - amount) <= 0.05;
    }
    const currencyOk =
      !currency ||
      !order.payment_meta?.whop_currency ||
      currency === String(order.payment_meta.whop_currency).toLowerCase() ||
      currency === 'sar';

    if (!amountOk || !currencyOk) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          payment_status: 'review_required',
          provider_payment_id: paymentId,
          payment_meta: {
            ...(order.payment_meta || {}),
            mismatch: { amount, currency, expectedWhop },
            last_event: eventType,
          },
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=minimal',
      });
      console.error('[whop/webhook] amount/currency mismatch', order.id);
      return json(res, 200, { ok: true, review_required: true });
    }

    await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: {
        payment_status: 'paid',
        status: 'ready_for_manual_fulfillment',
        provider_payment_id: paymentId,
        payment_meta: {
          ...(order.payment_meta || {}),
          paid_at: new Date().toISOString(),
          last_event: eventType,
          auto_purchase: false,
        },
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=minimal',
    });

    // Stock decrement (simple, once)
    try {
      const items = await sb(`order_items?order_id=eq.${encodeURIComponent(order.id)}&select=ref_id,quantity`);
      for (const it of Array.isArray(items.data) ? items.data : []) {
        if (!it.ref_id) continue;
        const pr = await sb(`products?id=eq.${encodeURIComponent(it.ref_id)}&select=stock_quantity,track_stock`);
        const p = Array.isArray(pr.data) ? pr.data[0] : null;
        if (p && p.track_stock !== false) {
          const next = Math.max(0, Number(p.stock_quantity || 0) - Number(it.quantity || 0));
          await sb(`products?id=eq.${encodeURIComponent(it.ref_id)}`, {
            method: 'PATCH',
            body: { stock_quantity: next, updated_at: new Date().toISOString() },
            prefer: 'return=minimal',
          });
        }
      }
    } catch (e) {
      console.error('[whop/webhook] stock update skipped', e?.message);
    }

    return json(res, 200, { ok: true, order_id: order.id, payment_status: 'paid' });
  }

  if (eventType === 'payment.failed' || eventType === 'payment.canceled') {
    if (order) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          payment_status: eventType === 'payment.failed' ? 'failed' : 'canceled',
          provider_payment_id: paymentId,
          payment_meta: { ...(order.payment_meta || {}), last_event: eventType },
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=minimal',
      });
    }
    return json(res, 200, { ok: true, handled: eventType });
  }

  if (eventType === 'dispute.created' || eventType === 'dispute.updated') {
    if (order) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          payment_status: 'review_required',
          payment_meta: { ...(order.payment_meta || {}), last_event: eventType, dispute: true },
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=minimal',
      });
    }
    return json(res, 200, { ok: true, handled: eventType });
  }

  // refund events if present
  if (eventType.includes('refund')) {
    if (order) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: {
          payment_status: 'refunded',
          payment_meta: { ...(order.payment_meta || {}), last_event: eventType },
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=minimal',
      });
    }
    return json(res, 200, { ok: true, handled: eventType });
  }

  return json(res, 200, { ok: true, ignored: eventType });
}
