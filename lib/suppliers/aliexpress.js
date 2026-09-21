import { createHmac } from 'node:crypto';

const API_BASE = 'https://api-sg.aliexpress.com';
const SYNC_PATH = '/sync';
const LEGACY_URL = 'https://eco.taobao.com/router/rest';

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : '';
}

function config() {
  return {
    appKey: env('ALIEXPRESS_APP_KEY') || env('ALIEXPRESS_API_KEY'),
    appSecret: env('ALIEXPRESS_APP_SECRET') || env('ALIEXPRESS_API_SECRET'),
    supabaseUrl: env('SUPABASE_URL') || 'https://mndyabvlhvrhdbgmepkg.supabase.co',
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function isConfigured() {
  const c = config();
  return !!(c.appKey && c.appSecret && c.serviceKey);
}

async function loadConnection() {
  const c = config();
  if (!c.serviceKey) return { ok: false, message: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  const r = await fetch(
    `${c.supabaseUrl.replace(/\/$/, '')}/rest/v1/supplier_connections?provider=eq.aliexpress&select=status,access_token,refresh_token,expires_at&limit=1`,
    {
      headers: {
        apikey: c.serviceKey,
        Authorization: `Bearer ${c.serviceKey}`,
        Accept: 'application/json',
      },
    }
  );
  const data = await r.json().catch(() => []);
  const row = Array.isArray(data) ? data[0] : null;
  if (!r.ok || !row) return { ok: false, message: 'AliExpress connection row not found' };
  return { ok: true, row };
}

function signModern(path, params, secret) {
  const apiPrefix = typeof params.method === 'string' && params.method.includes('/') ? params.method : '';
  const payload =
    apiPrefix +
    Object.keys(params)
      .filter((k) => k !== 'sign' && !(k === 'method' && apiPrefix))
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join('');
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex').toUpperCase();
}

function shanghaiTimestamp() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function signLegacy(params, secret) {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
  return createHmac('md5', secret).update(payload, 'utf8').digest('hex').toUpperCase();
}

function maybeJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function unwrapModern(data) {
  let body = data;
  if (body && typeof body.gopResponseBody === 'string') body = maybeJson(body.gopResponseBody);
  return body;
}

function extractProductQuery(data) {
  const body = unwrapModern(data);
  const top =
    body?.aliexpress_affiliate_product_query_response ||
    body?.aliexpressAffiliateProductQueryResponse ||
    body;
  const rr = top?.resp_result || top?.respResult || top?.result?.resp_result || null;
  const result = rr?.result || top?.result || null;
  const rawProducts =
    result?.products?.product ||
    result?.products?.integer ||
    result?.products ||
    [];
  const products = Array.isArray(rawProducts)
    ? rawProducts
    : rawProducts && typeof rawProducts === 'object'
      ? Object.values(rawProducts).filter((x) => x && typeof x === 'object')
      : [];
  const code = rr?.resp_code ?? rr?.respCode ?? top?.rsp_code ?? top?.code ?? null;
  const msg = rr?.resp_msg ?? rr?.respMsg ?? top?.rsp_msg ?? top?.message ?? null;
  const valid = result != null || (Number(code) === 200 && products.length >= 0);
  return { valid, code, msg, result, products, body };
}

function parsePrice(p) {
  const candidates = [
    ['target_sale_price', 'target_sale_price_currency'],
    ['sale_price', 'sale_price_currency'],
    ['app_sale_price', 'app_sale_price_currency'],
    ['target_original_price', 'target_original_price_currency'],
  ];
  for (const [pk, ck] of candidates) {
    if (p?.[pk] != null && p?.[pk] !== '') {
      const n = Number(String(p[pk]).replace(/[^0-9.\-]/g, ''));
      return {
        amount: Number.isFinite(n) ? n : null,
        currency: p?.[ck] || p?.target_sale_price_currency || p?.sale_price_currency || 'USD',
      };
    }
  }
  return { amount: null, currency: 'USD' };
}

function normalizeProduct(p) {
  const price = parsePrice(p);
  const small = p?.product_small_image_urls?.string || p?.product_small_image_urls || [];
  const images = [
    p?.product_main_image_url,
    ...(Array.isArray(small) ? small : []),
  ].filter((x) => typeof x === 'string' && x.startsWith('http'));

  return {
    supplier_product_id: String(p?.product_id ?? p?.item_id ?? ''),
    title: p?.product_title || p?.title || '',
    cost: price.amount,
    currency: price.currency,
    stock: null,
    shipping_estimate: p?.ship_to_days || p?.delivery_days || null,
    images: [...new Set(images)].slice(0, 8),
    product_url: p?.product_detail_url || p?.promotion_link || p?.affiliate_link || null,
    rating: p?.evaluate_rate || null,
    orders_30d: p?.lastest_volume != null ? Number(p.lastest_volume) : null,
    discount: p?.discount || null,
    shop_id: p?.shop_id != null ? String(p.shop_id) : null,
    seller_id: p?.seller_id != null ? String(p.seller_id) : null,
    raw: p,
    mock: false,
  };
}

async function modernCall(method, businessParams = {}, { requireToken = true } = {}) {
  const c = config();
  if (!c.appKey || !c.appSecret) {
    return { ok: false, error: 'credentials_missing', message: 'AliExpress app credentials missing' };
  }
  const conn = await loadConnection();
  if (requireToken && (!conn.ok || !conn.row?.access_token)) {
    return { ok: false, error: 'oauth_missing', message: conn.message || 'AliExpress OAuth token missing' };
  }

  const params = {
    app_key: c.appKey,
    format: 'json',
    method,
    sign_method: 'sha256',
    timestamp: String(Date.now()),
    v: '2.0',
    ...businessParams,
  };
  if (conn.ok && conn.row?.access_token) params.session = conn.row.access_token;
  params.sign = signModern('', params, c.appSecret);

  const url = `${API_BASE}${SYNC_PATH}?${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString()}`;

  const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, http_status: r.status, data, transport: 'api-sg' };
}

async function legacyCall(method, businessParams = {}, { requireToken = true } = {}) {
  const c = config();
  if (!c.appKey || !c.appSecret) {
    return { ok: false, error: 'credentials_missing', message: 'AliExpress app credentials missing' };
  }
  const conn = await loadConnection();
  if (requireToken && (!conn.ok || !conn.row?.access_token)) {
    return { ok: false, error: 'oauth_missing', message: conn.message || 'AliExpress OAuth token missing' };
  }

  const params = {
    app_key: c.appKey,
    format: 'json',
    method,
    sign_method: 'hmac',
    timestamp: shanghaiTimestamp(),
    v: '2.0',
    ...businessParams,
  };
  if (conn.ok && conn.row?.access_token) params.session = conn.row.access_token;
  params.sign = signLegacy(params, c.appSecret);

  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  );
  const r = await fetch(LEGACY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      Accept: 'application/json',
    },
    body,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, http_status: r.status, data, transport: 'legacy-top' };
}

async function callProductQuery(params) {
  const modern = await modernCall('aliexpress.affiliate.product.query', params, { requireToken: false });
  const parsedModern = extractProductQuery(modern.data);
  if (modern.ok && parsedModern.valid && Number(parsedModern.code ?? 200) === 200) {
    return { ...modern, parsed: parsedModern };
  }

  const legacy = await legacyCall('aliexpress.affiliate.product.query', params, { requireToken: false });
  const parsedLegacy = extractProductQuery(legacy.data);
  if (legacy.ok && parsedLegacy.valid && Number(parsedLegacy.code ?? 200) === 200) {
    return { ...legacy, parsed: parsedLegacy, fallback_from: modern.transport };
  }

  const modernErr = unwrapModern(modern.data);
  return {
    ok: false,
    status: 'error',
    transport: legacy.transport,
    message:
      parsedModern.msg ||
      modernErr?.message ||
      modernErr?.gopErrorCode ||
      parsedLegacy.msg ||
      legacy.data?.error_response?.msg ||
      'AliExpress product search failed',
    debug_code:
      parsedModern.code ||
      modernErr?.gopErrorCode ||
      parsedLegacy.code ||
      legacy.data?.error_response?.code ||
      null,
    modern_error_code: modernErr?.gopErrorCode || modernErr?.code || modernErr?.error_response?.code || null,
    modern_error_message: modernErr?.message || modernErr?.gopErrorMsg || modernErr?.error_response?.msg || null,
    legacy_error_code: legacy.data?.error_response?.code || parsedLegacy.code || null,
    legacy_error_message: legacy.data?.error_response?.msg || parsedLegacy.msg || null,
  };
}

export async function testConnection() {
  if (!isConfigured()) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'aliexpress',
      message: 'AliExpress app or Supabase service credentials missing',
      auto_purchase: false,
    };
  }
  const conn = await loadConnection();
  if (!conn.ok || !conn.row?.access_token) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'aliexpress',
      message: conn.message || 'OAuth token not connected',
      auto_purchase: false,
    };
  }
  return {
    ok: conn.row.status === 'connected',
    status: conn.row.status || 'connected',
    provider: 'aliexpress',
    message: 'AliExpress OAuth connected; live product search enabled',
    token_present: true,
    expires_at: conn.row.expires_at || null,
    live_api: true,
    auto_purchase: false,
  };
}

export async function searchProducts(query = '', limit = 10) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { ok: false, status: 'error', provider: 'aliexpress', products: [], message: 'query required' };
  if (!isConfigured()) {
    return { ok: false, status: 'not_configured', provider: 'aliexpress', products: [], message: 'AliExpress not configured' };
  }

  const pageSize = Math.max(1, Math.min(Number(limit) || 10, 50));
  const params = {
    keywords: q,
    page_no: '1',
    page_size: String(pageSize),
    target_currency: 'USD',
    target_language: 'EN',
    ship_to_country: 'SA',
    sort: 'LAST_VOLUME_DESC',
    fields: [
      'product_id',
      'product_title',
      'target_sale_price',
      'target_sale_price_currency',
      'target_original_price',
      'product_main_image_url',
      'product_small_image_urls',
      'product_detail_url',
      'evaluate_rate',
      'lastest_volume',
      'discount',
      'shop_id',
      'ship_to_days',
    ].join(','),
  };

  const live = await callProductQuery(params);
  if (!live.ok) {
    return {
      ok: false,
      status: 'error',
      provider: 'aliexpress',
      products: [],
      message: live.message,
      error_code: live.debug_code || null,
      modern_error_code: live.modern_error_code || null,
      modern_error_message: live.modern_error_message || null,
      legacy_error_code: live.legacy_error_code || null,
      legacy_error_message: live.legacy_error_message || null,
      transport: live.transport || null,
      live_api: true,
      mock: false,
      auto_purchase: false,
    };
  }

  const products = (live.parsed?.products || [])
    .map(normalizeProduct)
    .filter((p) => p.supplier_product_id && p.title);

  return {
    ok: true,
    status: 'connected',
    provider: 'aliexpress',
    query: q,
    products,
    count: products.length,
    total: Number(live.parsed?.result?.total_record_count || products.length),
    transport: live.transport,
    live_api: true,
    mock: false,
    auto_purchase: false,
    auto_publish: false,
  };
}

export async function getProductDetails(productId) {
  const id = String(productId || '').trim();
  if (!id) return { ok: false, status: 'error', provider: 'aliexpress', message: 'product id required' };

  const params = {
    product_id: id,
    ship_to_country: 'SA',
    target_currency: 'USD',
    target_language: 'EN',
  };

  let r = await modernCall('aliexpress.ds.product.get', params, { requireToken: true });
  let body = unwrapModern(r.data);
  let root = body?.aliexpress_ds_product_get_response || body;

  if (!r.ok || root?.error_response || root?.code) {
    r = await legacyCall('aliexpress.ds.product.get', params, { requireToken: true });
    body = r.data;
    root = body?.aliexpress_ds_product_get_response || body;
  }

  const result = root?.result || root?.data || null;
  if (!r.ok || !result) {
    return {
      ok: false,
      status: 'error',
      provider: 'aliexpress',
      message: root?.error_response?.msg || root?.msg || root?.message || 'Product details failed',
      transport: r.transport,
    };
  }

  return {
    ok: true,
    status: 'connected',
    provider: 'aliexpress',
    supplier_product_id: id,
    product: result,
    transport: r.transport,
    live_api: true,
    mock: false,
    auto_purchase: false,
  };
}

export async function getProductPrice(productId) {
  const d = await getProductDetails(productId);
  if (!d.ok) return { ...d, price: null, currency: 'USD' };
  const p = d.product || {};
  const price = parsePrice(p);
  return { ok: true, provider: 'aliexpress', supplier_product_id: String(productId), price: price.amount, currency: price.currency, mock: false };
}

export async function getProductInventory(productId) {
  const d = await getProductDetails(productId);
  if (!d.ok) return { ...d, stock: null };
  const p = d.product || {};
  const stock = p.total_available_stock ?? p.stock ?? p.available_stock ?? null;
  return { ok: true, provider: 'aliexpress', supplier_product_id: String(productId), stock: stock == null ? null : Number(stock), mock: false };
}

export async function getShippingInfo(productId) {
  const d = await getProductDetails(productId);
  if (!d.ok) return { ...d, estimate: null };
  const p = d.product || {};
  return {
    ok: true,
    provider: 'aliexpress',
    supplier_product_id: String(productId),
    estimate: p.delivery_time || p.ship_to_days || p.logistics_info || null,
    mock: false,
  };
}
