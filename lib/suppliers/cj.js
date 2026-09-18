/**
 * Tiqnora — CJ Dropshipping connector
 * Secrets: CJ_API_KEY only from process.env (Vercel). Never in DB / client / git.
 * No auto-purchase. No auto-publish. No auto fulfillment.
 *
 * Official docs: https://developers.cjdropshipping.com
 * Auth: POST /api2.0/v1/authentication/getAccessToken
 * List: GET  /api2.0/v1/product/listV2
 */

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function hasKey() {
  return !!env('CJ_API_KEY');
}

/** In-memory token cache for the serverless instance lifetime */
let _tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  const apiKey = env('CJ_API_KEY');
  if (!apiKey) {
    return { ok: false, status: 'not_configured', message: 'Missing env: CJ_API_KEY' };
  }

  // Reuse if still valid (5 min buffer)
  if (_tokenCache.accessToken && Date.now() < _tokenCache.expiresAt - 5 * 60 * 1000) {
    return { ok: true, accessToken: _tokenCache.accessToken, cached: true };
  }

  try {
    const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    const token = data?.data?.accessToken || data?.accessToken;
    if (!res.ok || data?.code !== 200 || !token) {
      return {
        ok: false,
        status: 'error',
        message: data?.message || `CJ auth failed (${res.status})`,
        code: data?.code,
      };
    }
    // CJ tokens last ~180 days; cache for 24h max in this process
    _tokenCache = {
      accessToken: token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    return { ok: true, accessToken: token, cached: false };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message || 'CJ auth network error' };
  }
}

async function cjGet(path, query = {}) {
  const auth = await getAccessToken();
  if (!auth.ok) return auth;

  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const url = `${CJ_BASE}${path}${qs.toString() ? `?${qs}` : ''}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'CJ-Access-Token': auth.accessToken,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.code != null && data.code !== 200)) {
      return {
        ok: false,
        status: 'error',
        message: data?.message || `CJ API ${res.status}`,
        code: data?.code,
        raw: data,
      };
    }
    return { ok: true, data: data.data ?? data, raw: data };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message || 'CJ network error' };
  }
}

/** Realistic demo product for admin testing when key missing or live fails */
function demoProduct(overrides = {}) {
  return {
    supplier_product_id: overrides.supplier_product_id || 'CJ-DEMO-TECH-001',
    pid: overrides.pid || 'CJ-DEMO-TECH-001',
    title: overrides.title || 'Magnetic Wireless Power Bank 10000mAh',
    title_ar: overrides.title_ar || 'باور بانك مغناطيسي لاسلكي 10000mAh',
    description:
      overrides.description ||
      'Slim magnetic wireless power bank 10000mAh, PD 20W, MagSafe-compatible, dual output. Ideal for phones and small devices.',
    description_ar:
      overrides.description_ar ||
      'باور بانك مغناطيسي لاسلكي رفيع 10000mAh، شحن PD 20W، متوافق مع MagSafe، منفذين. مناسب للجوالات والأجهزة الصغيرة.',
    cost: overrides.cost != null ? overrides.cost : 48.5,
    cost_sar: overrides.cost_sar != null ? overrides.cost_sar : 182,
    currency: 'USD',
    stock: overrides.stock != null ? overrides.stock : 126,
    shipping_estimate: '7-15 days',
    shipping_cost_usd: 3.5,
    category: 'Electronics / Mobile Accessories',
    images: overrides.images || [
      'https://www.tiqnora.com/assets/products/nd96-cable-6in1-1.jpg',
    ],
    variants: [
      { sku: 'CJ-DEMO-TECH-001-BK', name: 'Black', stock: 80, price: 48.5 },
      { sku: 'CJ-DEMO-TECH-001-WH', name: 'White', stock: 46, price: 48.5 },
    ],
    weight_g: 220,
    mock: true,
    provider: 'cj_dropshipping',
  };
}

function mapCjListItem(item) {
  if (!item) return null;
  const pid = String(item.pid || item.productId || item.id || '');
  const price = Number(item.sellPrice || item.price || item.productPrice || item.nowPrice || 0);
  const stock = Number(item.stock || item.productStock || item.inventory || 0);
  const images = [];
  if (item.productImage) images.push(item.productImage);
  if (Array.isArray(item.productImageList)) images.push(...item.productImageList.filter(Boolean));
  if (Array.isArray(item.images)) images.push(...item.images.filter(Boolean));

  return {
    supplier_product_id: pid,
    pid,
    title: item.productNameEn || item.productName || item.name || `CJ ${pid}`,
    title_ar: item.productName || item.productNameEn || null,
    description: item.description || item.productNameEn || '',
    description_ar: item.description || item.productName || '',
    cost: price,
    currency: 'USD',
    stock: Number.isFinite(stock) ? stock : 0,
    shipping_estimate: '7-18 days',
    category: item.categoryName || item.categoryNameEn || 'General',
    images: [...new Set(images)].slice(0, 8),
    variants: [],
    weight_g: item.productWeight || item.packWeight || null,
    mock: false,
    provider: 'cj_dropshipping',
    raw: item,
  };
}

export async function testConnection() {
  if (!hasKey()) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'cj_dropshipping',
      message: 'Missing env: CJ_API_KEY',
      live_api: false,
      auto_purchase: false,
    };
  }
  const auth = await getAccessToken();
  if (!auth.ok) {
    return {
      ok: false,
      status: 'error',
      provider: 'cj_dropshipping',
      message: auth.message || 'CJ authentication failed',
      live_api: true,
      auto_purchase: false,
    };
  }
  return {
    ok: true,
    status: 'connected',
    provider: 'cj_dropshipping',
    message: auth.cached
      ? 'CJ access token valid (cached)'
      : 'CJ access token obtained successfully',
    live_api: true,
    auto_purchase: false,
  };
}

export async function searchProducts(query = 'power bank', limit = 10) {
  if (!hasKey()) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'cj_dropshipping',
      products: [],
      message: 'Missing env: CJ_API_KEY',
      auto_purchase: false,
    };
  }

  const size = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const result = await cjGet('/product/listV2', {
    page: 1,
    size,
    keyWord: String(query || 'tech').slice(0, 80),
  });

  if (!result.ok) {
    // Graceful fallback for admin UI testing when live API is unreachable
    return {
      ok: false,
      status: result.status || 'error',
      provider: 'cj_dropshipping',
      products: [],
      message: result.message,
      live_api: true,
      auto_purchase: false,
    };
  }

  const list =
    result.data?.list ||
    result.data?.content ||
    result.data?.productList ||
    (Array.isArray(result.data) ? result.data : []) ||
    [];

  const products = list.map(mapCjListItem).filter(Boolean).slice(0, size);
  return {
    ok: true,
    status: 'connected',
    provider: 'cj_dropshipping',
    products,
    total: result.data?.total || products.length,
    mock: false,
    live_api: true,
    auto_purchase: false,
  };
}

export async function getProductDetails(supplierProductId) {
  const id = String(supplierProductId || '').trim();
  if (!id) {
    return { ok: false, status: 'error', message: 'supplierProductId required', provider: 'cj_dropshipping' };
  }

  if (!hasKey()) {
    if (id.startsWith('CJ-DEMO') || id.includes('DEMO')) {
      return { ok: true, status: 'not_configured', provider: 'cj_dropshipping', product: demoProduct({ supplier_product_id: id, pid: id }), mock: true };
    }
    return { ok: false, status: 'not_configured', message: 'Missing env: CJ_API_KEY', provider: 'cj_dropshipping' };
  }

  // Prefer query by pid when possible
  const result = await cjGet('/product/query', { pid: id });
  if (!result.ok) {
    // Fallback list search by id keyword
    const search = await searchProducts(id, 5);
    const found = (search.products || []).find((p) => p.pid === id || p.supplier_product_id === id);
    if (found) return { ok: true, status: 'connected', provider: 'cj_dropshipping', product: found, mock: false };
    return { ok: false, status: 'error', message: result.message || 'Product not found', provider: 'cj_dropshipping' };
  }

  const raw = result.data?.product || result.data || {};
  const mapped = mapCjListItem({ ...raw, pid: raw.pid || id });
  return {
    ok: true,
    status: 'connected',
    provider: 'cj_dropshipping',
    product: mapped,
    mock: false,
    live_api: true,
    auto_purchase: false,
  };
}

export async function getProductInventory(supplierProductId) {
  const details = await getProductDetails(supplierProductId);
  if (!details.ok) {
    return { ok: false, status: details.status, stock: null, provider: 'cj_dropshipping', message: details.message };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    stock: details.product?.stock ?? 0,
    mock: !!details.mock,
  };
}

export async function getProductPrice(supplierProductId) {
  const details = await getProductDetails(supplierProductId);
  if (!details.ok) {
    return { ok: false, status: details.status, price: null, provider: 'cj_dropshipping', message: details.message };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    price: details.product?.cost ?? null,
    currency: details.product?.currency || 'USD',
    mock: !!details.mock,
  };
}

export async function getShippingInfo(supplierProductId) {
  if (!hasKey() && !(String(supplierProductId || '').includes('DEMO'))) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'cj_dropshipping',
      message: 'Missing env: CJ_API_KEY',
    };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    estimate: '7-15 business days to Saudi Arabia',
    shipping_cost_usd: 3.5,
    status: hasKey() ? 'connected' : 'not_configured',
    mock: !hasKey(),
  };
}

/** Demo catalog for offline / missing-key admin tests */
export function getDemoCatalog(limit = 3) {
  const base = [
    demoProduct(),
    demoProduct({
      supplier_product_id: 'CJ-DEMO-TECH-002',
      pid: 'CJ-DEMO-TECH-002',
      title: 'USB-C Hub 7-in-1 Aluminum',
      title_ar: 'محول USB-C متعدد المنافذ 7 في 1',
      cost: 22.0,
      cost_sar: 83,
      stock: 340,
      images: ['https://www.tiqnora.com/assets/products/nd96-cable-6in1-1.jpg'],
    }),
    demoProduct({
      supplier_product_id: 'CJ-DEMO-TECH-003',
      pid: 'CJ-DEMO-TECH-003',
      title: 'LED Desk Lamp with Wireless Charger',
      title_ar: 'مصباح مكتب LED مع شاحن لاسلكي',
      cost: 31.5,
      cost_sar: 118,
      stock: 95,
      images: ['https://www.tiqnora.com/assets/products/nd96-desk-lamp-led-1.jpg'],
    }),
  ];
  return base.slice(0, Math.min(limit, base.length));
}

export function isConfigured() {
  return hasKey();
}

export default {
  testConnection,
  searchProducts,
  getProductDetails,
  getProductInventory,
  getProductPrice,
  getShippingInfo,
  getDemoCatalog,
  isConfigured,
  provider: 'cj_dropshipping',
};
