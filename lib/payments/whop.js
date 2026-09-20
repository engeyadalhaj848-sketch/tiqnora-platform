/**
 * Whop Payments helpers — SANDBOX by default.
 * Docs: https://docs.whop.com/developer/guides/accept-payments
 *       https://docs.whop.com/developer/guides/sandbox
 *       https://docs.whop.com/developer/guides/webhooks
 *
 * Architecture: Checkout Configuration with inline one_time plan (dynamic cart totals).
 * Embed uses sessionId (ch_*) + planId (plan_*). Webhook payment.succeeded is source of truth.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const PROD_API = 'https://api.whop.com/api/v1';
const SANDBOX_API = 'https://sandbox-api.whop.com/api/v1';

export function isSandbox() {
  const env = String(process.env.WHOP_ENVIRONMENT || 'sandbox').toLowerCase();
  return env !== 'production' && env !== 'live';
}

export function getWhopConfig() {
  const sandbox = isSandbox();
  const apiKey = process.env.WHOP_API_KEY || '';
  const accountId = process.env.WHOP_ACCOUNT_ID || '';
  const webhookSecret = process.env.WHOP_WEBHOOK_SECRET || '';
  // Prefer USD in sandbox unless WHOP_CURRENCY set — confirm SAR support in Whop dashboard
  const currency = String(process.env.WHOP_CURRENCY || (sandbox ? 'usd' : 'sar')).toLowerCase();
  const missing = [];
  if (!apiKey) missing.push('WHOP_API_KEY');
  if (!accountId) missing.push('WHOP_ACCOUNT_ID');
  return {
    sandbox,
    apiKey,
    accountId,
    webhookSecret,
    currency,
    baseUrl: sandbox ? SANDBOX_API : PROD_API,
    configured: missing.length === 0,
    missing,
  };
}

async function whopFetch(path, { method = 'GET', body } = {}) {
  const cfg = getWhopConfig();
  if (!cfg.apiKey) {
    return { ok: false, status: 503, error: 'WHOP_API_KEY missing', data: null };
  }
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Api-Version-Date': process.env.WHOP_API_VERSION_DATE || '2026-07-01',
  };
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data?.message || data?.error || `Whop HTTP ${res.status}`,
      data,
    };
  }
  return { ok: true, status: res.status, data };
}

/**
 * Create checkout configuration with dynamic one-time price.
 * Returns sessionId (checkout config id ch_*) and planId.
 */
export async function createCheckoutConfiguration({
  amount,
  currency,
  orderId,
  orderNumber,
  title = 'Tiqnora Order',
}) {
  const cfg = getWhopConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'Whop credentials not configured',
      missing: cfg.missing,
    };
  }

  const cur = (currency || cfg.currency || 'usd').toLowerCase();
  const price = Number(amount);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, status: 'error', message: 'invalid amount' };
  }

  // Official: POST checkout configurations with inline plan OR plan_id (not both)
  const body = {
    account_id: cfg.accountId,
    plan: {
      initial_price: price,
      plan_type: 'one_time',
      currency: cur,
      title: String(title).slice(0, 80),
    },
    metadata: {
      order_id: String(orderId),
      order_number: String(orderNumber || ''),
      source: 'tiqnora',
      environment: cfg.sandbox ? 'sandbox' : 'production',
    },
  };

  const result = await whopFetch('/checkout_configurations', { method: 'POST', body });
  if (!result.ok) {
    return {
      ok: false,
      status: 'error',
      message: result.error,
      details: result.data,
    };
  }

  const sessionId = result.data?.id || null;
  const planId = result.data?.plan?.id || result.data?.plan_id || null;
  if (!sessionId) {
    return { ok: false, status: 'error', message: 'Whop response missing checkout id' };
  }

  return {
    ok: true,
    sessionId,
    planId,
    currency: cur,
    amount: price,
    sandbox: cfg.sandbox,
    environment: cfg.sandbox ? 'sandbox' : 'production',
    raw_id: sessionId,
  };
}

/**
 * Verify Whop webhook (Standard Webhooks).
 * signed_content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 * key = WHOP_WEBHOOK_SECRET as given (ws_... — helper derives; we try direct and base64 strip)
 * Docs: https://docs.whop.com/developer/guides/webhooks
 */
export function verifyWebhookSignature(rawBody, headers) {
  const secret = process.env.WHOP_WEBHOOK_SECRET || '';
  if (!secret) {
    return { ok: false, reason: 'WHOP_WEBHOOK_SECRET missing' };
  }

  const h = {};
  for (const [k, v] of Object.entries(headers || {})) {
    h[String(k).toLowerCase()] = v;
  }
  const id = h['webhook-id'] || h['whop-webhook-id'] || '';
  const timestamp = h['webhook-timestamp'] || h['whop-webhook-timestamp'] || '';
  const signatureHeader = h['webhook-signature'] || h['whop-webhook-signature'] || '';

  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  // Reject stale timestamps (>5 minutes)
  const ts = Number(timestamp);
  if (Number.isFinite(ts)) {
    const skew = Math.abs(Date.now() / 1000 - ts);
    if (skew > 300) return { ok: false, reason: 'timestamp_out_of_range' };
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;

  // Secret may be ws_hex or plain; try as utf8 bytes of full secret
  const candidates = [secret];
  if (secret.startsWith('ws_')) candidates.push(secret.slice(3));
  if (secret.startsWith('whsec_')) candidates.push(secret.slice(6));

  const providedList = String(signatureHeader)
    .split(' ')
    .map((p) => p.replace(/^v1,/i, '').trim())
    .filter(Boolean);

  for (const key of candidates) {
    const computed = createHmac('sha256', key).update(signedContent, 'utf8').digest('base64');
    for (const provided of providedList) {
      try {
        const a = Buffer.from(computed);
        const b = Buffer.from(provided);
        if (a.length === b.length && timingSafeEqual(a, b)) {
          return { ok: true, eventId: id };
        }
      } catch {
        /* length mismatch */
      }
    }
    // Also try hex digest compare
    const computedHex = createHmac('sha256', key).update(signedContent, 'utf8').digest('hex');
    for (const provided of providedList) {
      if (provided === computedHex) return { ok: true, eventId: id };
    }
  }

  return { ok: false, reason: 'invalid_signature' };
}

export function parseWebhookEvent(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export default {
  isSandbox,
  getWhopConfig,
  createCheckoutConfiguration,
  verifyWebhookSignature,
  parseWebhookEvent,
};
