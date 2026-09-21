/**
 * Billing / integrations hub.
 * Hosts:
 *  - GET  (default) payment providers readiness
 *  - route=aliexpress_connect | aliexpress_callback | aliexpress_status
 *  - route=supplier_fulfillment_submit | order_create | whop_create_checkout | whop_order_status | whop_webhook
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
  getProductDetails as getAliExpressProductDetails,
  getShippingInfo as getAliExpressShippingInfo,
  placeApprovedOrder as placeAliExpressApprovedOrder,
} from '../../lib/suppliers/aliexpress.js';
import {
  getWhopConfig,
  createCheckoutConfiguration,
  verifyAndUnwrapWebhook,
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
  if (p.includes('aliexpress') && p.includes('connect')) return { route: 'aliexpress_connect', url };
  if (p.includes('aliexpress') && p.includes('callback')) return { route: 'aliexpress_callback', url };
  if (p.includes('aliexpress') && p.includes('status')) return { route: 'aliexpress_status', url };
  if (p.includes('supplier') && p.includes('fulfillment-submit')) return { route: 'supplier_fulfillment_submit', url };
  if (p.includes('create-checkout')) return { route: 'whop_create_checkout', url };
  if (p.includes('order-status')) return { route: 'whop_order_status', url };
  if (p.includes('whop') && p.includes('webhook')) return { route: 'whop_webhook', url };
  // COD / bank_transfer server-side order create (no new serverless file)
  if (p.includes('/orders/create') || p.includes('order_create') || p.includes('create-order')) {
    return { route: 'order_create', url };
  }
  return { route: '', url };
}

async function handleAliExpressConnect(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const cfg = getAeConfig();
  if (!cfg.configured) {
    return json(res, 503, {
      ok: false,
      error: 'not_configured',
      message: 'AliExpress credentials are not configured.',
      missing: cfg.missing,
    });
  }
  const state = createOAuthState();
  const auth = buildAuthorizeUrl({ state });
  if (!auth?.ok || !auth?.url) {
    return json(res, 500, {
      ok: false,
      error: 'authorize_url_failed',
      message: auth?.message || 'Could not build AliExpress authorize URL.',
    });
  }
  return redirect(res, auth.url);
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
          expires_at: token.expires_at || (token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null),
          refresh_expires_at: token.refresh_expires_at || null,
          seller_id: token.seller_id ? String(token.seller_id) : null,
          account_id: token.account ? String(token.account) : null,
          oauth_meta: {
            connected_at: new Date().toISOString(),
            token_mode: token.token_mode || null,
            app_status_expected: 'online',
            refresh_token_note: 'AliExpress self-developed apps require reauthorization at expiry; refresh token is not relied on.',
          },
          status: 'connected',
          last_error: null,
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
  let connection = null;
  try {
    const cr = await sb(
      'supplier_connections?provider=eq.aliexpress&select=status,expires_at,updated_at,last_error&limit=1'
    );
    connection = Array.isArray(cr.data) ? cr.data[0] : null;
  } catch { /* status remains credential-only */ }

  const expiryMs = connection?.expires_at ? Date.parse(connection.expires_at) : 0;
  const expired = !!expiryMs && expiryMs <= Date.now();
  const hoursRemaining = expiryMs ? Math.max(0, Math.round((expiryMs - Date.now()) / 3600000)) : null;
  return json(res, 200, {
    ok: true,
    provider: 'aliexpress',
    credentials_configured: cfg.configured,
    missing: cfg.missing,
    redirect_uri: cfg.redirectUri,
    connected: !!(connection && connection.status === 'connected' && !expired),
    connection_status: expired ? 'reauthorization_required' : (connection?.status || 'not_connected'),
    expires_at: connection?.expires_at || null,
    hours_remaining: hoursRemaining,
    reauthorize_required: expired || (hoursRemaining != null && hoursRemaining <= 168),
    last_error: connection?.last_error || null,
    authorize_url_ready: !!(auth && auth.url && cfg.configured),
    authorize_url: auth && cfg.configured ? auth.url : null,
  });
}



async function requireAdminUser(req) {
  const auth = String(req.headers?.authorization || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] || '';
  if (!token || !SERVICE) return { ok: false, status: 401, error: 'admin_auth_required' };

  try {
    const ur = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const user = await ur.json().catch(() => null);
    if (!ur.ok || !user?.id) return { ok: false, status: 401, error: 'invalid_admin_session' };

    const pr = await sb(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active&limit=1`
    );
    const profile = Array.isArray(pr.data) ? pr.data[0] : null;
    const allowed = ['admin', 'super_admin', 'owner'].includes(String(profile?.role || ''));
    if (!profile || profile.is_active === false || !allowed) {
      return { ok: false, status: 403, error: 'admin_permission_required' };
    }
    return { ok: true, user, profile };
  } catch {
    return { ok: false, status: 401, error: 'admin_auth_failed' };
  }
}

async function handleSupplierFulfillmentSubmit(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const admin = await requireAdminUser(req);
  if (!admin.ok) return json(res, admin.status, { ok: false, error: admin.error });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.confirm_submit !== true) {
    return json(res, 400, {
      ok: false,
      error: 'explicit_confirmation_required',
      message: 'confirm_submit=true is required for live supplier order creation.',
    });
  }
  const fulfillmentId = String(body.fulfillment_request_id || '').trim();
  if (!fulfillmentId) return json(res, 400, { ok: false, error: 'fulfillment_request_id required' });

  const frRes = await sb(
    `fulfillment_requests?id=eq.${encodeURIComponent(fulfillmentId)}&select=id,order_id,supplier_id,status,request_payload,approved_by,approved_at,supplier_order_reference&limit=1`
  );
  const fulfillment = Array.isArray(frRes.data) ? frRes.data[0] : null;
  if (!fulfillment) return json(res, 404, { ok: false, error: 'fulfillment_not_found' });
  if (fulfillment.status !== 'approved') {
    return json(res, 409, {
      ok: false,
      error: 'fulfillment_not_approved',
      status: fulfillment.status,
      message: 'Approve the fulfillment request in Tiqnora before submitting it to AliExpress.',
    });
  }

  const supRes = await sb(
    `commerce_suppliers?id=eq.${encodeURIComponent(fulfillment.supplier_id || '')}&select=id,provider,display_name,fulfillment_mode&limit=1`
  );
  const supplier = Array.isArray(supRes.data) ? supRes.data[0] : null;
  if (!supplier || supplier.provider !== 'aliexpress') {
    return json(res, 400, { ok: false, error: 'supplier_not_aliexpress' });
  }
  if (supplier.fulfillment_mode !== 'approval_required') {
    return json(res, 409, { ok: false, error: 'invalid_fulfillment_mode' });
  }

  const soRes = await sb(
    `supplier_orders?fulfillment_request_id=eq.${encodeURIComponent(fulfillment.id)}&select=*&order=created_at.desc&limit=1`
  );
  const supplierOrder = Array.isArray(soRes.data) ? soRes.data[0] : null;
  if (!supplierOrder) {
    return json(res, 409, {
      ok: false,
      error: 'supplier_order_not_prepared',
      message: 'Prepare the supplier order in Tiqnora before submitting.',
    });
  }
  if (supplierOrder.status === 'submitted' && supplierOrder.external_order_id) {
    return json(res, 200, {
      ok: true,
      duplicate_prevented: true,
      status: 'submitted',
      supplier_order_id: supplierOrder.id,
      external_order_id: supplierOrder.external_order_id,
      auto_purchase: false,
    });
  }
  if (!['ready', 'failed'].includes(String(supplierOrder.status || ''))) {
    return json(res, 409, {
      ok: false,
      error: 'supplier_order_not_ready',
      status: supplierOrder.status,
    });
  }

  const requestPayload = fulfillment.request_payload || {};
  const customer = requestPayload.customer || {};
  const shipping = requestPayload.shipping || {};
  const sourceItems = Array.isArray(requestPayload.items) ? requestPayload.items : [];
  if (!sourceItems.length) {
    return json(res, 400, { ok: false, error: 'no_supplier_items' });
  }

  const preparedItems = [];
  for (const item of sourceItems) {
    const productId = String(item.supplier_product_id || '').trim();
    if (!/^\d+$/.test(productId)) {
      return json(res, 400, {
        ok: false,
        error: 'invalid_aliexpress_product_id',
        product_id: productId || null,
      });
    }

    let skuAttr = '';
    let details = null;
    try {
      details = await getAliExpressProductDetails(productId);
      const variants = Array.isArray(details?.product?.variants) ? details.product.variants : [];
      const wanted = String(item.supplier_variant_id || '');
      const chosen =
        (wanted && variants.find((v) => String(v.sku_id || '') === wanted)) ||
        (variants.length === 1 ? variants[0] : null);
      skuAttr = String(chosen?.sku_attr || '');
    } catch { /* product can still be ordered without sku_attr when not required */ }

    let freight = null;
    try {
      freight = await getAliExpressShippingInfo(productId, {
        countryCode: shipping.country || 'SA',
        quantity: Number(item.quantity || 1),
      });
    } catch { /* logistics_service_name is optional */ }

    preparedItems.push({
      product_id: productId,
      product_count: Math.max(1, Number(item.quantity || 1) || 1),
      sku_attr: skuAttr || undefined,
      logistics_service_name: freight?.ok ? (freight.service_name || undefined) : undefined,
      order_memo: `Tiqnora order ${requestPayload.order_number || fulfillment.order_id}`,
      supplier_mapping_id: item.supplier_mapping_id || null,
      supplier_price: item.supplier_price ?? null,
      supplier_currency: item.supplier_currency || 'USD',
    });
  }

  const phoneRaw = String(customer.phone || '').replace(/[^0-9+]/g, '');
  const phoneCountry = phoneRaw.startsWith('+') ? ('+' + phoneRaw.slice(1).replace(/\D/g, '').slice(0, 3)) : '+966';
  const mobileNo = phoneRaw.startsWith('+966')
    ? phoneRaw.slice(4)
    : phoneRaw.startsWith('966')
      ? phoneRaw.slice(3)
      : phoneRaw.replace(/^0+/, '');

  const address = {
    address: shipping.address,
    city: shipping.city,
    country: shipping.country || 'SA',
    full_name: customer.name,
    contact_person: customer.name,
    mobile_no: mobileNo || customer.phone,
    phone_country: phoneCountry || '+966',
    postal_code: shipping.postal_code || '',
    province: shipping.city || '',
    locale: 'en_US',
  };

  const live = await placeAliExpressApprovedOrder({
    approved: true,
    address,
    items: preparedItems,
  });

  const now = new Date().toISOString();
  const totalCost = preparedItems.reduce(
    (sum, x) => sum + (Number(x.supplier_price || 0) * Number(x.product_count || 1)),
    0
  );
  const cleanItems = preparedItems.map((x) => ({
    product_id: x.product_id,
    product_count: x.product_count,
    sku_attr: x.sku_attr || null,
    logistics_service_name: x.logistics_service_name || null,
    supplier_mapping_id: x.supplier_mapping_id,
    supplier_price: x.supplier_price,
    supplier_currency: x.supplier_currency,
  }));

  if (!live.ok) {
    await sb(`supplier_orders?id=eq.${encodeURIComponent(supplierOrder.id)}`, {
      method: 'PATCH',
      body: {
        status: 'failed',
        line_items: cleanItems,
        request_payload: {
          provider: 'aliexpress',
          fulfillment_request_id: fulfillment.id,
          item_count: cleanItems.length,
          explicit_admin_approval: true,
        },
        response_payload: {
          ok: false,
          error_code: live.error_code || null,
          message: live.message || 'AliExpress submission failed',
          transport: live.transport || null,
        },
        updated_at: now,
      },
      prefer: 'return=minimal',
    });
    await sb(`fulfillment_requests?id=eq.${encodeURIComponent(fulfillment.id)}`, {
      method: 'PATCH',
      body: {
        error_message: String(live.message || 'AliExpress submission failed').slice(0, 500),
        updated_at: now,
      },
      prefer: 'return=minimal',
    });
    return json(res, 502, {
      ok: false,
      error: 'aliexpress_order_submission_failed',
      message: live.message || 'AliExpress submission failed',
      error_code: live.error_code || null,
      auto_purchase: false,
    });
  }

  await sb(`supplier_orders?id=eq.${encodeURIComponent(supplierOrder.id)}`, {
    method: 'PATCH',
    body: {
      status: 'submitted',
      external_order_id: live.external_order_id,
      line_items: cleanItems,
      cost_total: totalCost || null,
      currency: cleanItems.find((x) => x.supplier_currency)?.supplier_currency || 'USD',
      request_payload: {
        provider: 'aliexpress',
        fulfillment_request_id: fulfillment.id,
        item_count: cleanItems.length,
        explicit_admin_approval: true,
      },
      response_payload: {
        ok: true,
        external_order_ids: live.external_order_ids,
        payment_required_on_aliexpress: true,
        payment_automated: false,
      },
      submitted_at: now,
      updated_at: now,
    },
    prefer: 'return=minimal',
  });

  await sb(`fulfillment_requests?id=eq.${encodeURIComponent(fulfillment.id)}`, {
    method: 'PATCH',
    body: {
      status: 'submitted',
      supplier_order_reference: live.external_order_id,
      response_payload: {
        provider: 'aliexpress',
        external_order_ids: live.external_order_ids,
        payment_required_on_aliexpress: true,
      },
      submitted_at: now,
      error_message: null,
      updated_at: now,
    },
    prefer: 'return=minimal',
  });

  try {
    await sb('commerce_audit_logs', {
      method: 'POST',
      body: {
        actor_id: admin.user.id,
        action: 'aliexpress.order.submit',
        entity_type: 'fulfillment_requests',
        entity_id: fulfillment.id,
        meta: {
          supplier_order_id: supplierOrder.id,
          external_order_id: live.external_order_id,
          item_count: cleanItems.length,
          payment_automated: false,
        },
      },
      prefer: 'return=minimal',
    });
  } catch { /* audit logging must not break successful supplier submission */ }

  return json(res, 200, {
    ok: true,
    status: 'submitted',
    fulfillment_request_id: fulfillment.id,
    supplier_order_id: supplierOrder.id,
    external_order_id: live.external_order_id,
    payment_required_on_aliexpress: true,
    payment_automated: false,
    auto_purchase: false,
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
      slug: p.slug,
      sku: p.sku,
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
  const testProductFreeShipping = lineItems.length > 0 && lineItems.every((it) => it.sku === 'TQ-LIVE-TEST-001');
  if (subtotal >= freeThreshold || testProductFreeShipping) shippingCost = 0;
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
      slug: p.slug, sku: p.sku,
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
  const testProductFreeShipping = lineItems.length > 0 && lineItems.every((it) => it.sku === 'TQ-LIVE-TEST-001');
  if (subtotal >= freeThreshold || testProductFreeShipping) shippingCost = 0;
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
    currency: 'SAR',
    status: 'pending',
    payment_status: 'unpaid',
    payment_method: 'credit_card', // Whop card/gateway; payment_provider remains 'whop'
    payment_provider: 'whop',
    notes: body.notes ? String(body.notes).slice(0, 500) : null,
    payment_meta: {
      environment: isSandbox() ? 'sandbox' : 'production',
      items_count: lineItems.length,
      auto_purchase: false,
    },
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


async function queueFulfillmentForPaidOrder(order) {
  // Phase 1: queue supplier fulfillment for admin approval only.
  // This function NEVER submits or purchases from a supplier.
  if (!order?.id) return { queued: 0, skipped: 'missing_order' };

  const itemsRes = await sb(
    `order_items?order_id=eq.${encodeURIComponent(order.id)}&item_type=eq.product&select=id,ref_id,title_ar,title_en,unit_price,quantity,line_total`
  );
  const orderItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
  if (!orderItems.length) return { queued: 0, skipped: 'no_product_items' };

  const productIds = [...new Set(orderItems.map((i) => String(i.ref_id || '')).filter(Boolean))];
  if (!productIds.length) return { queued: 0, skipped: 'no_product_ids' };

  const idList = productIds.map(encodeURIComponent).join(',');
  const mapRes = await sb(
    `supplier_product_mapping?tiqnora_product_id=in.(${idList})&select=id,supplier_id,provider,supplier_product_id,tiqnora_product_id,supplier_price,supplier_stock,currency,raw_snapshot`
  );
  const mappings = Array.isArray(mapRes.data) ? mapRes.data : [];
  if (!mappings.length) return { queued: 0, skipped: 'no_supplier_mapping' };

  const mappingByProduct = new Map();
  for (const m of mappings) {
    const pid = String(m.tiqnora_product_id || '');
    if (!pid || !m.supplier_id) continue;
    // Prefer a connected CJ mapping when multiple mappings ever exist.
    const prev = mappingByProduct.get(pid);
    if (!prev || (m.provider === 'cj_dropshipping' && prev.provider !== 'cj_dropshipping')) {
      mappingByProduct.set(pid, m);
    }
  }

  const groups = new Map();
  for (const item of orderItems) {
    const mapping = mappingByProduct.get(String(item.ref_id || ''));
    if (!mapping?.supplier_id) continue; // own-stock/unmapped items do not go to supplier fulfillment.
    const key = String(mapping.supplier_id);
    if (!groups.has(key)) groups.set(key, { supplier_id: key, provider: mapping.provider || null, items: [] });
    groups.get(key).items.push({
      order_item_id: item.id,
      product_id: item.ref_id,
      title_ar: item.title_ar,
      title_en: item.title_en,
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
      supplier_mapping_id: mapping.id,
      supplier_product_id: mapping.supplier_product_id,
      supplier_price: mapping.supplier_price != null ? Number(mapping.supplier_price) : null,
      supplier_stock: mapping.supplier_stock != null ? Number(mapping.supplier_stock) : null,
      supplier_currency: mapping.currency || null,
      // Variant is retained only as a reference for later admin review; no purchase is triggered.
      supplier_variant_id:
        mapping.raw_snapshot?.selected_variant_id ||
        mapping.raw_snapshot?.variant_id ||
        mapping.raw_snapshot?.vid ||
        null,
    });
  }

  let queued = 0;
  for (const group of groups.values()) {
    const existing = await sb(
      `fulfillment_requests?order_id=eq.${encodeURIComponent(order.id)}&supplier_id=eq.${encodeURIComponent(group.supplier_id)}&select=id,status&limit=1`
    );
    if (Array.isArray(existing.data) && existing.data.length) continue;

    const payload = {
      provider: group.provider,
      order_number: order.order_number,
      payment_status: 'paid',
      auto_purchase: false,
      requires_admin_approval: true,
      customer: {
        name: order.customer_name || null,
        email: order.customer_email || null,
        phone: order.customer_phone || null,
      },
      shipping: {
        address: order.shipping_address || null,
        city: order.shipping_city || null,
        postal_code: order.shipping_postal_code || null,
        country: order.shipping_country || 'SA',
      },
      items: group.items,
      totals: {
        order_total: Number(order.total || 0),
        currency: order.currency || 'SAR',
      },
    };

    const ins = await sb('fulfillment_requests', {
      method: 'POST',
      body: {
        order_id: order.id,
        supplier_id: group.supplier_id,
        status: 'awaiting_approval',
        request_payload: payload,
        response_payload: {},
      },
      prefer: 'return=minimal',
    });
    if (!ins.error) queued += 1;
    else console.error('[fulfillment_queue] insert failed', String(ins.error).slice(0, 160));
  }

  return { queued, supplier_groups: groups.size, auto_purchase: false };
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

  const verified = verifyAndUnwrapWebhook(rawBody, req.headers || {});
  if (!verified.ok) {
    console.error('[whop_webhook] signature failed:', verified.reason || 'invalid_signature');
    return json(res, 401, { ok: false, error: 'invalid_signature' });
  }
  const event = verified.event;
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
    const paidAt = new Date().toISOString();
    await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: {
        payment_status: 'paid', status: 'confirmed', provider_payment_id: paymentId,
        payment_meta: { ...(order.payment_meta || {}), paid_at: paidAt, last_event: eventType, auto_purchase: false },
        updated_at: paidAt,
      },
      prefer: 'return=minimal',
    });

    // Queue fulfillment only after payment is verified. Supplier submission stays disabled.
    const paidOrder = {
      ...order,
      payment_status: 'paid',
      status: 'confirmed',
      provider_payment_id: paymentId,
      payment_meta: { ...(order.payment_meta || {}), paid_at: paidAt, last_event: eventType, auto_purchase: false },
    };
    let fulfillment = { queued: 0, auto_purchase: false };
    try {
      fulfillment = await queueFulfillmentForPaidOrder(paidOrder);
    } catch (err) {
      console.error('[fulfillment_queue] unexpected error', String(err?.message || err).slice(0, 160));
      // Payment acknowledgement must not fail because fulfillment queueing failed.
    }

    return json(res, 200, {
      ok: true,
      order_id: order.id,
      payment_status: 'paid',
      fulfillment,
      auto_purchase: false,
    });
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

    if (route === 'aliexpress_connect') return handleAliExpressConnect(req, res);
    if (route === 'aliexpress_callback') return handleAliExpressCallback(req, res, url);
    if (route === 'aliexpress_status') return handleAliExpressStatus(req, res);
    if (route === 'supplier_fulfillment_submit') return handleSupplierFulfillmentSubmit(req, res);
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
