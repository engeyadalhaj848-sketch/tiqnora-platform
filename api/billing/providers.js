/**
 * Billing / integrations hub.
 * Hosts:
 *  - GET  (default) payment providers readiness
 *  - route=aliexpress_callback | aliexpress_status
 *  - route=order_create | whop_create_checkout | whop_order_status | whop_webhook
 *
 * Public URLs are rewritten in vercel.json to this existing function
 * (project cannot deploy additional Serverless Function files).
 */
import {
  getConfig as getAeConfig,
  verifyOAuthState,
  exchangeCodeForToken,
  buildAuthorizeUrl,
  createOAuthState,
} from '../../lib/suppliers/aliexpress-oauth.js';
import {
  getWhopConfig,
  createCheckoutConfiguration,
  verifyWebhookSignature,
  parseWebhookEvent,
  isSandbox,
} from '../../lib/payments/whop.js';


/** Disable automatic JSON body parsing so webhook signatures see exact raw bytes. */
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  // Prefer already-buffered body when present (tests / some runtimes)
  if (typeof req.body === 'string' && req.body.length) return req.body;
  if (Buffer.isBuffer(req.body) && req.body.length) return req.body.toString('utf8');
  if (req.rawBody && typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');

  // Node IncomingMessage stream
  if (req.readable === false && req.body && typeof req.body === 'object') {
    // Body already consumed/parsed — cannot recover original bytes
    return null;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function redirect(res, path) {
  const loc = path.startsWith('http') ? path : `https://www.tiqnora.com${path}`;
  res.statusCode = 302;
  res.setHeader('Location', loc);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) return { error: (data && data.message) || `supabase ${r.status}`, data };
  return { data };
}

function money2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function toWhopAmount(totalSar, currency) {
  const cur = String(currency || 'usd').toLowerCase();
  if (cur === 'sar') return money2(totalSar);
  const rate = Number(process.env.SAR_TO_USD_RATE || (1 / 3.75));
  return money2(Number(totalSar) * rate);
}

function resolveRoute(req) {
  const host = req.headers?.host || 'www.tiqnora.com';
  let url;
  try { url = new URL(req.url || '/', `https://${host}`); } catch { url = new URL('https://www.tiqnora.com/'); }
  const q = url.searchParams.get('route') || '';
  if (q) return { route: q, url };
  const p = url.pathname || '';
  if (p.includes('aliexpress') && p.includes('callback')) return { route: 'aliexpress_callback', url };
  if (p.includes('aliexpress') && p.includes('status')) return { route: 'aliexpress_status', url };
  if (p.includes('create-checkout')) return { route: 'whop_create_checkout', url };
  if (p.includes('order-status')) return { route: 'whop_order_status', url };
  if (p.includes('whop') && p.includes('webhook')) return { route: 'whop_webhook', url };
  // COD / bank_transfer server-side order create (no new serverless file)
  if (p.includes('/orders/create') || p.includes('order_create') || p.includes('create-order')) {
    return { route: 'order_create', url };
  }
  return { route: '', url };
}

async function handleAliExpressCallback(req, res, url) {
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const error = url.searchParams.get('error') || '';
  const errorDescription = url.searchParams.get('error_description') || '';
  const wantJson = url.searchParams.get('format') === 'json' || (req.headers?.accept || '').includes('application/json');
  const ADMIN_OK = '/admin.html?aliexpress=connected#commerce-integrations';
  const ADMIN_ERR = '/admin.html?aliexpress=error#commerce-integrations';

  if (error) {
    const payload = { ok: false, error, error_description: errorDescription || null };
    return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=${encodeURIComponent(error)}`);
  }
  if (!code) {
    const payload = {
      ok: false,
      error: 'authorization_code_missing',
      message: 'Authorization code missing. This endpoint is the AliExpress OAuth callback.',
      credentials_configured: getAeConfig().configured,
    };
    return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=missing_code`);
  }
  if (state) {
    const st = verifyOAuthState(state);
    if (!st.ok) {
      const payload = { ok: false, error: 'invalid_state', reason: st.reason };
      return wantJson ? json(res, 400, payload) : redirect(res, `${ADMIN_ERR}&reason=invalid_state`);
    }
  }
  const cfg = getAeConfig();
  if (!cfg.configured) {
    const payload = {
      ok: false,
      error: 'not_configured',
      message: 'Callback received code but ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET are not configured yet.',
      missing: cfg.missing,
    };
    return wantJson ? json(res, 503, payload) : redirect(res, `${ADMIN_ERR}&reason=not_configured`);
  }
  const token = await exchangeCodeForToken(code);
  if (!token.ok) {
    const payload = { ok: false, error: 'token_exchange_failed', message: token.message };
    return wantJson ? json(res, 502, payload) : redirect(res, `${ADMIN_ERR}&reason=token_failed`);
  }
  try {
    if (SERVICE && token.access_token) {
      await sb('supplier_connections?provider=eq.aliexpress', {
        method: 'PATCH',
        body: {
          access_token: token.access_token,
          refresh_token: token.refresh_token || null,
          token_expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        prefer: 'return=minimal',
      });
    }
  } catch { /* non-fatal */ }
  return wantJson
    ? json(res, 200, { ok: true, connected: true, message: 'AliExpress connected' })
    : redirect(res, ADMIN_OK);
}

async function handleAliExpressStatus(req, res) {
  const cfg = getAeConfig();
  const state = createOAuthState();
  const auth = cfg.configured ? buildAuthorizeUrl({ state }) : null;
  return json(res, 200, {
    ok: true,
    provider: 'aliexpress',
    credentials_configured: cfg.configured,
    missing: cfg.missing,
    redirect_uri: cfg.redirectUri,
    authorize_url_ready: !!(auth && auth.url && cfg.configured),
    authorize_url: auth && cfg.configured ? auth.url : null,
  });
}


/**
 * Validate cart items server-side and build order + line items.
 * Never trusts browser prices/totals.
 * @returns {{ ok:true, customer, shipping, lineItems, subtotal, shippingCost, totalSar, orderNumber, notes } | { ok:false, status, body }}
 */
async function buildValidatedOrderFromBody(body) {
  const itemsIn = Array.isArray(body.items) ? body.items : [];
  if (!itemsIn.length) return { ok: false, status: 400, body: { ok: false, error: 'items required' } };

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
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: 'customer_name, customer_phone, shipping_address, shipping_city required' },
    };
  }

  const ids = [...new Set(itemsIn.map((i) => String(i.product_id || i.id || '')).filter(Boolean))];
  if (!ids.length) return { ok: false, status: 400, body: { ok: false, error: 'product_id required on each item' } };
  const idList = ids.map(encodeURIComponent).join(',');
  const prodRes = await sb(
    `products?id=in.(${idList})&select=id,slug,sku,name_ar,name_en,price,stock_quantity,track_stock,is_active,fulfillment_type,cost_price`
  );
  if (prodRes.error) return { ok: false, status: 500, body: { ok: false, error: 'Failed to load products' } };
  const products = Array.isArray(prodRes.data) ? prodRes.data : [];
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const lineItems = [];
  let subtotal = 0;
  for (const row of itemsIn) {
    const pid = String(row.product_id || row.id || '');
    const qty = Math.max(1, Math.min(99, parseInt(row.quantity || row.qty || 1, 10) || 1));
    const p = byId[pid];
    if (!p) return { ok: false, status: 400, body: { ok: false, error: 'invalid_product', product_id: pid } };
    if (!p.is_active) return { ok: false, status: 400, body: { ok: false, error: 'product_inactive', product_id: pid } };
    if (p.track_stock !== false && Number(p.stock_quantity || 0) < qty) {
      return {
        ok: false,
        status: 400,
        body: { ok: false, error: 'out_of_stock', product_id: pid, available: Number(p.stock_quantity || 0) },
      };
    }
    const unit = money2(p.price);
    if (p.cost_price != null && Number(p.cost_price) > 0 && unit + 0.01 < Number(p.cost_price)) {
      return { ok: false, status: 409, body: { ok: false, error: 'pricing_review_required', product_id: pid } };
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
    });
  }

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
  } catch { /* defaults */ }
  if (subtotal >= freeThreshold) shippingCost = 0;
  const totalSar = money2(subtotal + shippingCost);
  const orderNumber = `TQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const notes = String(body.notes || '').trim().slice(0, 1000) || null;

  return {
    ok: true,
    customer,
    shipping,
    lineItems,
    subtotal,
    shippingCost,
    totalSar,
    orderNumber,
    notes,
  };
}

/**
 * COD / bank_transfer — server-side order create (service role).
 * Browser must NOT insert into orders/order_items.
 */
async function handleOrderCreate(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }
  }
  body = body || {};

  const method = String(body.payment_method || body.method || '').toLowerCase().trim();
  if (method !== 'cod' && method !== 'bank_transfer') {
    return json(res, 400, { ok: false, error: 'payment_method must be cod or bank_transfer' });
  }

  const built = await buildValidatedOrderFromBody(body);
  if (!built.ok) return json(res, built.status, built.body);

  const {
    customer, shipping, lineItems, subtotal, shippingCost, totalSar, orderNumber, notes,
  } = built;

  // COD / bank: not paid; eligible for manual fulfillment review
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
    status: 'pending',
    payment_status: 'unpaid', // enum: unpaid|paid|failed|refunded
    payment_method: method, // enum includes cod|bank_transfer
    payment_provider: 'manual',
    notes,
    // snapshot required by schema
    items: lineItems.map((it) => ({
      kind: 'product',
      ref_id: it.ref_id,
      title_ar: it.title_ar,
      title_en: it.title_en,
      price: it.unit_price,
      qty: it.quantity,
    })),
    payment_meta: {
      source: 'tiqnora_checkout',
      method,
      items_count: lineItems.length,
    },
  };

  const ins = await sb('orders', { method: 'POST', body: orderRow, prefer: 'return=representation' });
  if (ins.error) {
    console.error('[order_create]', String(ins.error).slice(0, 240));
    return json(res, 500, { ok: false, error: 'order_create_failed', message: 'تعذر حفظ الطلب. حاول مرة أخرى.' });
  }
  const order = Array.isArray(ins.data) ? ins.data[0] : ins.data;
  if (!order?.id) return json(res, 500, { ok: false, error: 'order_create_failed' });

  await sb('order_items', {
    method: 'POST',
    body: lineItems.map((it) => ({
      order_id: order.id,
      item_type: it.item_type,
      ref_id: it.ref_id,
      title_ar: it.title_ar,
      title_en: it.title_en,
      unit_price: it.unit_price,
      quantity: it.quantity,
      line_total: it.line_total,
    })),
    prefer: 'return=minimal',
  });

  return json(res, 200, {
    ok: true,
    order_id: order.id,
    order_number: order.order_number,
    subtotal,
    shipping_cost: shippingCost,
    total: totalSar,
    currency: 'SAR',
    payment_method: method,
    payment_status: 'unpaid',
    status: 'pending',
    track_url: `https://www.tiqnora.com/track.html?order=${encodeURIComponent(order.order_number)}&new=1`,
  });
}

async function handleWhopCreateCheckout(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }
  }
  body = body || {};
  const itemsIn = Array.isArray(body.items) ? body.items : [];
  if (!itemsIn.length) return json(res, 400, { ok: false, error: 'items required' });

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
    return json(res, 400, { ok: false, error: 'customer_name, customer_phone, shipping_address, shipping_city required' });
  }

  const ids = [...new Set(itemsIn.map((i) => String(i.product_id || i.id || '')).filter(Boolean))];
  if (!ids.length) return json(res, 400, { ok: false, error: 'product_id required on each item' });
  const idList = ids.map(encodeURIComponent).join(',');
  const prodRes = await sb(`products?id=in.(${idList})&select=id,slug,sku,name_ar,name_en,price,stock_quantity,track_stock,is_active,fulfillment_type,cost_price`);
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
      return json(res, 400, { ok: false, error: 'out_of_stock', product_id: pid, available: Number(p.stock_quantity || 0) });
    }
    const unit = money2(p.price);
    if (p.cost_price != null && Number(p.cost_price) > 0 && unit + 0.01 < Number(p.cost_price)) {
      return json(res, 409, { ok: false, error: 'pricing_review_required', product_id: pid });
    }
    const lineTotal = money2(unit * qty);
    subtotal = money2(subtotal + lineTotal);
    lineItems.push({
      product_id: p.id, item_type: 'product', ref_id: p.id,
      title_ar: p.name_ar || p.name_en || p.slug,
      title_en: p.name_en || p.name_ar || p.slug,
      unit_price: unit, quantity: qty, line_total: lineTotal,
    });
  }

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
  } catch { /* defaults */ }
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
    subtotal, discount_amount: 0, shipping_cost: shippingCost, total: totalSar,
    currency: 'SAR', status: 'pending', payment_status: 'unpaid', payment_provider: 'whop',
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
    payment_meta: { environment: isSandbox() ? 'sandbox' : 'production', items_count: lineItems.length },
  };
  const ins = await sb('orders', { method: 'POST', body: orderRow, prefer: 'return=representation' });
  if (ins.error) return json(res, 500, { ok: false, error: 'order_create_failed', detail: ins.error });
  const order = Array.isArray(ins.data) ? ins.data[0] : ins.data;
  if (!order?.id) return json(res, 500, { ok: false, error: 'order_create_failed' });

  await sb('order_items', {
    method: 'POST',
    body: lineItems.map((it) => ({
      order_id: order.id, item_type: it.item_type, ref_id: it.ref_id,
      title_ar: it.title_ar, title_en: it.title_en, unit_price: it.unit_price, quantity: it.quantity, line_total: it.line_total,
    })),
    prefer: 'return=minimal',
  });

  const cfg = getWhopConfig();
  if (!cfg.configured) {
    return json(res, 200, {
      ok: true, order_id: order.id, order_number: order.order_number,
      subtotal, shipping_cost: shippingCost, total: totalSar, currency: 'SAR',
      payment_provider: 'whop', payment_status: 'unpaid',
      whop: { configured: false, missing: cfg.missing, message: 'Order created. Add WHOP_API_KEY + WHOP_ACCOUNT_ID in Vercel.' },
      environment: isSandbox() ? 'sandbox' : 'production',
    });
  }

  const checkout = await createCheckoutConfiguration({
    amount: toWhopAmount(totalSar, cfg.currency),
    currency: cfg.currency,
    orderId: order.id,
    orderNumber: order.order_number,
    title: `Tiqnora ${order.order_number}`,
  });
  if (!checkout.ok) {
    // User-facing message stays safe; technical details are server-side only
    const userMessage = 'تعذر بدء عملية الدفع الإلكتروني حاليًا. حاول مرة أخرى لاحقًا.';
    console.error('[whop_create_checkout]', {
      order_id: order.id,
      code: checkout.code || null,
      http_status: checkout.http_status || null,
      message: String(checkout.message || '').slice(0, 160),
      has_product_id: !!(checkout.details && checkout.details.has_product_id),
      permission_hint: checkout.permission_hint || null,
    });
    return json(res, 502, {
      ok: false,
      error: 'whop_checkout_failed',
      message: userMessage,
      order_id: order.id,
      order_number: order.order_number,
      // Safe diagnostic for admin/debug — no secrets
      diagnostic: {
        code: checkout.code || null,
        http_status: checkout.http_status || null,
        has_product_id: !!(checkout.details && checkout.details.has_product_id),
        environment: checkout.details?.environment || null,
        permission_hint: checkout.permission_hint || null,
      },
    });
  }
  await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH',
    body: {
      provider_checkout_id: checkout.sessionId,
      provider_plan_id: checkout.planId,
      payment_meta: { environment: checkout.environment, whop_currency: checkout.currency, whop_amount: checkout.amount, amount_sar: totalSar },
      updated_at: new Date().toISOString(),
    },
  });
  return json(res, 200, {
    ok: true, order_id: order.id, order_number: order.order_number,
    subtotal, shipping_cost: shippingCost, total: totalSar, currency: 'SAR',
    payment_provider: 'whop', payment_status: 'unpaid',
    whop: { configured: true, sessionId: checkout.sessionId, planId: checkout.planId, environment: checkout.environment, charge_currency: checkout.currency, charge_amount: checkout.amount },
    return_url: `https://www.tiqnora.com/order-complete?order=${encodeURIComponent(order.order_number)}`,
    environment: checkout.environment,
  });
}

async function handleWhopOrderStatus(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const orderNumber = url.searchParams.get('order') || url.searchParams.get('order_number') || '';
  if (!orderNumber) return json(res, 400, { ok: false, error: 'order required' });
  if (!SERVICE) return json(res, 503, { ok: false, error: 'not_configured' });
  const or = await sb(`orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=order_number,status,payment_status,payment_provider,total,currency,created_at&limit=1`);
  const o = Array.isArray(or.data) ? or.data[0] : null;
  if (!o) return json(res, 404, { ok: false, error: 'not_found' });
  const paid = o.payment_status === 'paid';
  return json(res, 200, {
    ok: true, order_number: o.order_number, payment_status: o.payment_status, order_status: o.status,
    payment_provider: o.payment_provider, total: o.total, currency: o.currency || 'SAR', paid,
    message: paid ? 'تم تأكيد الدفع' : o.payment_status === 'unpaid' ? 'بانتظار الدفع / جارٍ التحقق' : o.payment_status === 'failed' ? 'فشل الدفع' : 'جارٍ التحقق من عملية الدفع',
  });
}

async function handleWhopWebhook(req, res, rawBodyInput) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  // MUST use exact raw request text — never JSON.stringify(parsedObject)
  let rawBody = typeof rawBodyInput === 'string' ? rawBodyInput : '';
  if (!rawBody) {
    if (typeof req.body === 'string') rawBody = req.body;
    else if (Buffer.isBuffer(req.body)) rawBody = req.body.toString('utf8');
  }
  if (!rawBody) {
    console.error('[whop_webhook] missing raw body — cannot verify signature');
    return json(res, 401, { ok: false, error: 'invalid_signature' });
  }

  const verified = verifyWebhookSignature(rawBody, req.headers || {});
  if (!verified.ok) {
    console.error('[whop_webhook] signature failed:', verified.reason || 'invalid_signature');
    return json(res, 401, { ok: false, error: 'invalid_signature' });
  }
  const event = parseWebhookEvent(rawBody);
  if (!event || !event.type) return json(res, 400, { ok: false, error: 'invalid_payload' });

  const eventId = verified.eventId || event.id;
  const eventType = String(event.type);
  if (eventId) {
    const existing = await sb(`payment_webhook_events?provider=eq.whop&event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`);
    if (Array.isArray(existing.data) && existing.data.length) return json(res, 200, { ok: true, duplicate: true });
  }

  const data = event.data || {};
  const metadata = data.metadata || {};
  const orderId = metadata.order_id || null;
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
    const or = await sb(`orders?order_number=eq.${encodeURIComponent(metadata.order_number)}&select=*&limit=1`);
    order = Array.isArray(or.data) ? or.data[0] : null;
  }

  await sb('payment_webhook_events', {
    method: 'POST',
    body: {
      provider: 'whop', event_id: String(eventId || `unknown-${Date.now()}`), event_type: eventType,
      order_id: order?.id || null,
      payload_summary: { payment_id: paymentId, status: paymentStatus, amount, currency, type: eventType, sandbox: isSandbox() },
    },
    prefer: 'return=minimal',
  });

  if (eventType === 'payment.succeeded' || (eventType === 'payment.created' && paymentStatus === 'succeeded')) {
    if (!order) return json(res, 200, { ok: true, matched: false });
    const expectedWhop = order.payment_meta?.whop_amount != null ? Number(order.payment_meta.whop_amount) : null;
    let amountOk = true;
    if (expectedWhop != null && amount != null) {
      amountOk = Math.abs(expectedWhop - amount) <= 0.05 || Math.abs(Number(order.total) - amount) <= 0.05;
    }
    if (!amountOk) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: { payment_status: 'unpaid', notes: 'whop_amount_mismatch_review', provider_payment_id: paymentId, updated_at: new Date().toISOString() },
        prefer: 'return=minimal',
      });
      return json(res, 200, { ok: true, review_required: true });
    }
    await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: {
        payment_status: 'paid', status: 'confirmed', provider_payment_id: paymentId,
        payment_meta: { ...(order.payment_meta || {}), paid_at: new Date().toISOString(), last_event: eventType, auto_purchase: false },
        updated_at: new Date().toISOString(),
      },
      prefer: 'return=minimal',
    });
    return json(res, 200, { ok: true, order_id: order.id, payment_status: 'paid' });
  }
  if (eventType === 'payment.failed' || eventType === 'payment.canceled') {
    if (order) {
      await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        body: { payment_status: 'failed', provider_payment_id: paymentId, updated_at: new Date().toISOString() },
        prefer: 'return=minimal',
      });
    }
    return json(res, 200, { ok: true, handled: eventType });
  }
  return json(res, 200, { ok: true, ignored: eventType });
}

export default async function handler(req, res) {
  try {
    const { route, url } = resolveRoute(req);

    // Read raw body once (bodyParser disabled). Webhook needs exact bytes.
    let rawBody = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      try {
        rawBody = await readRawBody(req);
      } catch (e) {
        console.error('[billing hub] readRawBody failed');
        rawBody = null;
      }
      // Populate req.body for JSON routes without destroying rawBody variable
      if (route !== 'whop_webhook' && rawBody) {
        try {
          req.body = JSON.parse(rawBody);
        } catch {
          req.body = {};
        }
      }
    }

    if (route === 'aliexpress_callback') return handleAliExpressCallback(req, res, url);
    if (route === 'aliexpress_status') return handleAliExpressStatus(req, res);
    if (route === 'order_create') return handleOrderCreate(req, res);
    if (route === 'whop_create_checkout') return handleWhopCreateCheckout(req, res);
    if (route === 'whop_order_status') return handleWhopOrderStatus(req, res, url);
    if (route === 'whop_webhook') return handleWhopWebhook(req, res, rawBody);

    // Default: providers readiness (original behavior)
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
    const whop = getWhopConfig();
    const ae = getAeConfig();
    return res.status(200).end(JSON.stringify({
      livePayments: false,
      providers: [
        { slug: 'manual', name: 'Manual Admin', enabled: true, envRequired: [] },
        { slug: 'whop', name: 'Whop', enabled: !!whop.configured, mode: whop.sandbox ? 'sandbox' : 'live', configured: whop.configured, has_product_id: !!whop.productId, envRequired: ['WHOP_API_KEY', 'WHOP_ACCOUNT_ID', 'WHOP_WEBHOOK_SECRET'], recommended: ['WHOP_PRODUCT_ID'] },
        { slug: 'stripe', name: 'Stripe', enabled: false, envRequired: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
        { slug: 'hyperpay', name: 'HyperPay', enabled: false, envRequired: ['HYPERPAY_ENTITY_ID', 'HYPERPAY_ACCESS_TOKEN'] },
        { slug: 'tap', name: 'Tap Payments', enabled: false, envRequired: ['TAP_SECRET_KEY'] },
        { slug: 'mada', name: 'Mada', enabled: false, envRequired: ['MADA_VIA_PROVIDER'], note: 'Typically via HyperPay or Tap' },
      ],
      aliexpress: { credentials_configured: ae.configured, missing: ae.missing },
      message: 'Architecture ready — Whop sandbox + AliExpress OAuth via this hub (no extra serverless functions).',
    }));
  } catch (e) {
    return json(res, 500, { ok: false, error: 'internal_error', message: e.message || 'error' });
  }
}
