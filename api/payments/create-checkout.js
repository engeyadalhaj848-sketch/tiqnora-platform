/**
 * POST /api/payments/create-checkout
 * Server-side: validate cart → price from DB → optional CJ guard → create order → Whop sandbox session.
 * Client sends product IDs + quantities only — never trusts browser totals.
 */
import {
  getWhopConfig,
  createCheckoutConfiguration,
  isSandbox,
} from '../../lib/payments/whop.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function sb(path, { method = 'GET', body, prefer } = {}) {
  if (!SERVICE) return { error: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: prefer || (method === 'POST' ? 'return=representation' : 'return=minimal'),
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
  if (!r.ok) return { error: (data && data.message) || `supabase ${r.status}`, data };
  return { data };
}

function money2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Convert SAR total to Whop charge currency when needed */
function toWhopAmount(totalSar, currency) {
  const cur = String(currency || 'usd').toLowerCase();
  if (cur === 'sar') return money2(totalSar);
  // Documented fixed pipeline rate (same as commerce elsewhere)
  const rate = Number(process.env.SAR_TO_USD_RATE || (1 / 3.75));
  return money2(Number(totalSar) * rate);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON' });
    }
  }
  body = body || {};

  const itemsIn = Array.isArray(body.items) ? body.items : [];
  if (!itemsIn.length) return json(res, 400, { ok: false, error: 'items required' });
  if (itemsIn.length > 50) return json(res, 400, { ok: false, error: 'too many items' });

  const customer = {
    name: String(body.customer_name || body.name || '').trim().slice(0, 120),
    email: String(body.customer_email || body.email || '').trim().slice(0, 160),
    phone: String(body.customer_phone || body.phone || '').trim().slice(0, 40),
  };
  const shipping = {
    address: String(body.shipping_address || body.address || '').trim().slice(0, 500),
    city: String(body.shipping_city || body.city || '').trim().slice(0, 80),
    postal_code: String(body.shipping_postal_code || body.postal_code || '').trim().slice(0, 20),
    country: String(body.shipping_country || body.country || 'SA').trim().slice(0, 2).toUpperCase() || 'SA',
  };

  if (!customer.name || !customer.phone || !shipping.address || !shipping.city) {
    return json(res, 400, {
      ok: false,
      error: 'customer_name, customer_phone, shipping_address, shipping_city required',
    });
  }

  // Load products by ID from DB (trusted prices)
  const ids = [...new Set(itemsIn.map((i) => String(i.product_id || i.id || '')).filter(Boolean))];
  if (!ids.length) return json(res, 400, { ok: false, error: 'product_id required on each item' });

  const idList = ids.map(encodeURIComponent).join(',');
  const prodRes = await sb(
    `products?id=in.(${idList})&select=id,slug,sku,name_ar,name_en,price,stock_quantity,track_stock,is_active,fulfillment_type,cost_price`
  );
  if (prodRes.error) return json(res, 500, { ok: false, error: 'Failed to load products' });
  const products = Array.isArray(prodRes.data) ? prodRes.data : [];
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const lineItems = [];
  let subtotal = 0;
  for (const row of itemsIn) {
    const pid = String(row.product_id || row.id || '');
    const qty = Math.max(1, Math.min(99, parseInt(row.quantity || row.qty || 1, 10) || 1));
    const p = byId[pid];
    if (!p) return json(res, 400, { ok: false, error: 'invalid_product', product_id: pid });
    if (!p.is_active) return json(res, 400, { ok: false, error: 'product_inactive', product_id: pid });
    if (p.track_stock !== false && Number(p.stock_quantity || 0) < qty) {
      return json(res, 400, {
        ok: false,
        error: 'out_of_stock',
        product_id: pid,
        available: Number(p.stock_quantity || 0),
      });
    }
    // CJ / dropship price guard: if cost_price exists and margin would be negative, block
    const unit = money2(p.price);
    if (p.cost_price != null && Number(p.cost_price) > 0 && unit + 0.01 < Number(p.cost_price)) {
      return json(res, 409, {
        ok: false,
        error: 'pricing_review_required',
        message: 'Product price requires review before payment',
        product_id: pid,
      });
    }
    const lineTotal = money2(unit * qty);
    subtotal = money2(subtotal + lineTotal);
    lineItems.push({
      product_id: p.id,
      item_type: 'product',
      ref_id: p.id,
      title_ar: p.name_ar || p.name_en || p.slug,
      title_en: p.name_en || p.name_ar || p.slug,
      unit_price: unit,
      quantity: qty,
      line_total: lineTotal,
      sku: p.sku || null,
      fulfillment_type: p.fulfillment_type || null,
    });
  }

  // Shipping from site_settings or defaults (server-side)
  let shippingCost = 25;
  let freeThreshold = 500;
  try {
    const sres = await sb('site_settings?key=eq.shipping&select=value');
    const row = Array.isArray(sres.data) ? sres.data[0] : null;
    const val = row?.value;
    if (val && typeof val === 'object') {
      if (val.flat_rate != null) shippingCost = Number(val.flat_rate) || shippingCost;
      if (val.free_threshold != null) freeThreshold = Number(val.free_threshold) || freeThreshold;
    }
  } catch {
    /* defaults */
  }
  if (subtotal >= freeThreshold) shippingCost = 0;
  const totalSar = money2(subtotal + shippingCost);

  const orderNumber = `TQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const orderRow = {
    order_number: orderNumber,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_email: customer.email || null,
    shipping_address: shipping.address,
    shipping_city: shipping.city,
    shipping_postal_code: shipping.postal_code || null,
    shipping_country: shipping.country,
    subtotal,
    discount_amount: 0,
    shipping_cost: shippingCost,
    total: totalSar,
    currency: 'SAR',
    status: 'pending_payment',
    payment_status: 'pending',
    payment_provider: 'whop',
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
    payment_meta: {
      environment: isSandbox() ? 'sandbox' : 'production',
      items_count: lineItems.length,
    },
  };

  const ins = await sb('orders', { method: 'POST', body: orderRow, prefer: 'return=representation' });
  if (ins.error) {
    return json(res, 500, { ok: false, error: 'order_create_failed', detail: ins.error });
  }
  const order = Array.isArray(ins.data) ? ins.data[0] : ins.data;
  if (!order?.id) return json(res, 500, { ok: false, error: 'order_create_failed' });

  const itemRows = lineItems.map((it) => ({
    order_id: order.id,
    item_type: it.item_type,
    ref_id: it.ref_id,
    title_ar: it.title_ar,
    title_en: it.title_en,
    unit_price: it.unit_price,
    quantity: it.quantity,
    line_total: it.line_total,
  }));
  await sb('order_items', { method: 'POST', body: itemRows, prefer: 'return=minimal' });

  const cfg = getWhopConfig();
  if (!cfg.configured) {
    return json(res, 200, {
      ok: true,
      order_id: order.id,
      order_number: order.order_number,
      subtotal,
      shipping_cost: shippingCost,
      total: totalSar,
      currency: 'SAR',
      payment_provider: 'whop',
      payment_status: 'pending',
      whop: {
        configured: false,
        missing: cfg.missing,
        message: 'Order created. Add WHOP_API_KEY + WHOP_ACCOUNT_ID in Vercel to enable checkout session.',
      },
      environment: isSandbox() ? 'sandbox' : 'production',
    });
  }

  const whopAmount = toWhopAmount(totalSar, cfg.currency);
  const checkout = await createCheckoutConfiguration({
    amount: whopAmount,
    currency: cfg.currency,
    orderId: order.id,
    orderNumber: order.order_number,
    title: `Tiqnora ${order.order_number}`,
  });

  if (!checkout.ok) {
    await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: {
        payment_status: 'pending',
        payment_meta: {
          ...(order.payment_meta || {}),
          whop_error: checkout.message || 'checkout_failed',
        },
        updated_at: new Date().toISOString(),
      },
    });
    return json(res, 502, {
      ok: false,
      error: 'whop_checkout_failed',
      message: checkout.message,
      order_id: order.id,
      order_number: order.order_number,
    });
  }

  await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH',
    body: {
      provider_checkout_id: checkout.sessionId,
      provider_plan_id: checkout.planId,
      payment_meta: {
        environment: checkout.environment,
        whop_currency: checkout.currency,
        whop_amount: checkout.amount,
        amount_sar: totalSar,
      },
      updated_at: new Date().toISOString(),
    },
  });

  return json(res, 200, {
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    subtotal,
    shipping_cost: shippingCost,
    total: totalSar,
    currency: 'SAR',
    payment_provider: 'whop',
    payment_status: 'pending',
    whop: {
      configured: true,
      sessionId: checkout.sessionId,
      planId: checkout.planId,
      environment: checkout.environment,
      charge_currency: checkout.currency,
      charge_amount: checkout.amount,
    },
    return_url: `https://www.tiqnora.com/order-complete?order=${encodeURIComponent(order.order_number)}`,
    environment: checkout.environment,
  });
}
