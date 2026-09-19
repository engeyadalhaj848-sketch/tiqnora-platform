/**
 * Tiqnora — CJ Dropshipping connector (Supplier Adapter)
 * Secrets: CJ_API_KEY only from process.env (Vercel). Never in DB / client / git.
 * No auto-purchase. No auto-publish. No auto fulfillment.
 *
 * Official docs: https://developers.cjdropshipping.com
 * Auth: POST /api2.0/v1/authentication/getAccessToken
 * Header: CJ-Access-Token
 * List:  GET /api2.0/v1/product/listV2
 * Query: GET /api2.0/v1/product/query
 * Variant: GET /api2.0/v1/product/variant/query
 * Stock: GET /api2.0/v1/product/stock/queryByVid
 * Freight: GET/POST /api2.0/v1/logistic/freightCalculate
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
let _tokenCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

function parsePrice(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  // CJ often returns ranges like "2.79 -- 5.56" or "1.20 -- 2.28"
  const range = s.match(/([\d.]+)\s*[-–—]+\s*([\d.]+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.min(a, b);
  }
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function extractList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  // Prefer non-empty arrays only (empty [] is truthy in JS — previous bug)
  const candidates = [
    data.productList,
    data.list,
    data.content,
    data.records,
    data.products,
    data.data?.productList,
    data.data?.list,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

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
    const refresh = data?.data?.refreshToken || data?.refreshToken || null;
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
      refreshToken: refresh,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    return { ok: true, accessToken: token, cached: false };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message || 'CJ auth network error' };
  }
}

async function cjRequest(method, path, { query = {}, body = null } = {}) {
  const auth = await getAccessToken();
  if (!auth.ok) return auth;

  const qs = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const url = `${CJ_BASE}${path}${qs.toString() ? `?${qs}` : ''}`;

  try {
    const opts = {
      method: method || 'GET',
      headers: {
        'CJ-Access-Token': auth.accessToken,
        'Content-Type': 'application/json',
      },
    };
    if (body != null && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
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

async function cjGet(path, query = {}) {
  return cjRequest('GET', path, { query });
}

/** Realistic demo product for admin testing when key missing or live fails */
function demoProduct(overrides = {}) {
  return {
    supplier_product_id: overrides.supplier_product_id || 'CJ-DEMO-TECH-001',
    pid: overrides.pid || 'CJ-DEMO-TECH-001',
    sku: overrides.sku || 'CJ-DEMO-TECH-001',
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
      { sku: 'CJ-DEMO-TECH-001-BK', name: 'Black', stock: 80, price: 48.5, vid: 'DEMO-VID-BK' },
      { sku: 'CJ-DEMO-TECH-001-WH', name: 'White', stock: 46, price: 48.5, vid: 'DEMO-VID-WH' },
    ],
    weight_g: 220,
    mock: true,
    provider: 'cj_dropshipping',
  };
}

function mapCjListItem(item) {
  if (!item || typeof item !== 'object') return null;
  // Skip wrapper objects that only contain nested lists
  if (item.productList && !item.id && !item.pid && !item.productId && !item.nameEn && !item.sku) {
    return null;
  }

  const pid = String(
    item.pid || item.productId || item.id || item.productSku || item.sku || ''
  ).trim();
  if (!pid) return null;

  const price = parsePrice(
    item.sellPrice ?? item.nowPrice ?? item.price ?? item.productPrice ?? item.discountPrice
  );
  const stock = Number(
    item.totalVerifiedInventory ??
      item.warehouseInventoryNum ??
      item.stock ??
      item.productStock ??
      item.inventory ??
      item.inventoryNum ??
      0
  );
  const images = [];
  if (item.bigImage) images.push(item.bigImage);
  if (item.productImage) images.push(item.productImage);
  if (Array.isArray(item.productImageList)) images.push(...item.productImageList.filter(Boolean));
  if (Array.isArray(item.images)) images.push(...item.images.filter(Boolean));
  if (Array.isArray(item.imageList)) images.push(...item.imageList.filter(Boolean));

  const title =
    item.nameEn ||
    item.productNameEn ||
    item.productName ||
    item.name ||
    item.title ||
    `CJ ${pid}`;

  return {
    supplier_product_id: pid,
    pid,
    sku: item.sku || item.productSku || null,
    title,
    title_ar: item.productName || item.name || null,
    description: item.description || item.nameEn || title || '',
    description_ar: item.description || item.productName || '',
    cost: price,
    currency: item.currency || 'USD',
    stock: Number.isFinite(stock) ? stock : 0,
    shipping_estimate: '7-18 days',
    category:
      item.threeCategoryName ||
      item.categoryName ||
      item.categoryNameEn ||
      item.oneCategoryName ||
      'General',
    category_id: item.categoryId || null,
    images: [...new Set(images.filter(Boolean))].slice(0, 12),
    variants: [],
    weight_g: item.productWeight || item.packWeight || item.weight || null,
    listed_num: item.listedNum != null ? Number(item.listedNum) : null,
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

  const list = extractList(result.data);
  const products = list.map(mapCjListItem).filter(Boolean).slice(0, size);
  return {
    ok: true,
    status: 'connected',
    provider: 'cj_dropshipping',
    products,
    total: result.data?.total ?? result.data?.totalCount ?? products.length,
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
      return {
        ok: true,
        status: 'not_configured',
        provider: 'cj_dropshipping',
        product: demoProduct({ supplier_product_id: id, pid: id }),
        mock: true,
      };
    }
    return {
      ok: false,
      status: 'not_configured',
      message: 'Missing env: CJ_API_KEY',
      provider: 'cj_dropshipping',
    };
  }

  // Prefer query by pid
  let result = await cjGet('/product/query', { pid: id });
  if (!result.ok) {
    // Some IDs work better as productId / keyword
    result = await cjGet('/product/query', { productId: id });
  }
  if (!result.ok) {
    const search = await searchProducts(id, 8);
    const found = (search.products || []).find(
      (p) => p.pid === id || p.supplier_product_id === id || p.sku === id
    );
    if (found) {
      return {
        ok: true,
        status: 'connected',
        provider: 'cj_dropshipping',
        product: found,
        mock: false,
        live_api: true,
      };
    }
    return {
      ok: false,
      status: 'error',
      message: result.message || 'Product not found',
      provider: 'cj_dropshipping',
    };
  }

  const raw = result.data?.product || result.data || {};
  // If query returns a list-shaped payload
  const fromList = extractList(result.data);
  const candidate = fromList.find((x) => String(x.id || x.pid) === id) || raw;
  const mapped = mapCjListItem({ ...candidate, pid: candidate.pid || candidate.id || id });
  if (!mapped) {
    return {
      ok: false,
      status: 'error',
      message: 'Unable to map product details',
      provider: 'cj_dropshipping',
    };
  }

  // Attach variants when available
  try {
    const variantsRes = await getVariants(id);
    if (variantsRes.ok && Array.isArray(variantsRes.variants) && variantsRes.variants.length) {
      mapped.variants = variantsRes.variants;
      // Prefer lowest variant price / sum stock if list stock is weak
      const stocks = variantsRes.variants.map((v) => Number(v.stock) || 0);
      if (stocks.some((s) => s > 0)) {
        mapped.stock = stocks.reduce((a, b) => a + b, 0);
      }
      const prices = variantsRes.variants.map((v) => Number(v.price) || 0).filter((p) => p > 0);
      if (prices.length && (!mapped.cost || mapped.cost === 0)) {
        mapped.cost = Math.min(...prices);
      }
    }
  } catch {
    /* non-fatal */
  }

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

export async function getVariants(supplierProductId) {
  const id = String(supplierProductId || '').trim();
  if (!id) {
    return { ok: false, status: 'error', message: 'supplierProductId required', variants: [] };
  }
  if (!hasKey()) {
    if (id.includes('DEMO')) {
      return { ok: true, variants: demoProduct({ pid: id }).variants, mock: true, provider: 'cj_dropshipping' };
    }
    return { ok: false, status: 'not_configured', variants: [], provider: 'cj_dropshipping' };
  }

  const result = await cjGet('/product/variant/query', { pid: id });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 'error',
      message: result.message,
      variants: [],
      provider: 'cj_dropshipping',
    };
  }

  const list = extractList(result.data) || result.data?.variants || [];
  const variants = (Array.isArray(list) ? list : []).map((v) => ({
    vid: String(v.vid || v.variantId || v.id || ''),
    sku: v.variantSku || v.sku || v.productSku || null,
    name: v.variantNameEn || v.variantName || v.name || v.property || 'Default',
    price: parsePrice(v.variantSellPrice ?? v.sellPrice ?? v.price),
    stock: Number(v.variantStock ?? v.stock ?? v.inventory ?? 0) || 0,
    image: v.variantImage || v.image || null,
    weight_g: v.weight || v.packWeight || null,
  })).filter((v) => v.vid || v.sku);

  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: id,
    variants,
    mock: false,
    live_api: true,
  };
}

export async function getProductInventory(supplierProductId) {
  const details = await getProductDetails(supplierProductId);
  if (!details.ok) {
    return {
      ok: false,
      status: details.status,
      stock: null,
      provider: 'cj_dropshipping',
      message: details.message,
    };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    stock: details.product?.stock ?? 0,
    variants: details.product?.variants || [],
    mock: !!details.mock,
    live_api: !details.mock,
  };
}

export async function getProductPrice(supplierProductId) {
  const details = await getProductDetails(supplierProductId);
  if (!details.ok) {
    return {
      ok: false,
      status: details.status,
      price: null,
      provider: 'cj_dropshipping',
      message: details.message,
    };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    price: details.product?.cost ?? null,
    currency: details.product?.currency || 'USD',
    mock: !!details.mock,
    live_api: !details.mock,
  };
}

/**
 * Shipping estimate.
 * Tries live freightCalculate when possible; otherwise returns conservative SA estimate.
 * Never invents a precise cost when the API fails.
 */
export async function getShippingInfo(supplierProductId, { countryCode = 'SA', quantity = 1 } = {}) {
  const id = String(supplierProductId || '').trim();
  if (!hasKey() && !id.includes('DEMO')) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'cj_dropshipping',
      message: 'Missing env: CJ_API_KEY',
    };
  }

  // Live freight when key present — best effort
  if (hasKey() && id && !id.includes('DEMO')) {
    try {
      // CJ freightCalculate typically needs vid + country + quantity
      const variants = await getVariants(id);
      const vid = variants.variants?.[0]?.vid;
      if (vid) {
        const freight = await cjGet('/logistic/freightCalculate', {
          startCountryCode: 'CN',
          endCountryCode: countryCode || 'SA',
          products: JSON.stringify([{ vid, quantity: Number(quantity) || 1 }]),
        });
        // Alternate shape some docs use
        if (!freight.ok) {
          const alt = await cjRequest('POST', '/logistic/freightCalculate', {
            body: {
              startCountryCode: 'CN',
              endCountryCode: countryCode || 'SA',
              products: [{ vid, quantity: Number(quantity) || 1 }],
            },
          });
          if (alt.ok && alt.data) {
            const options = extractList(alt.data) || (Array.isArray(alt.data) ? alt.data : [alt.data]);
            const first = options[0] || alt.data;
            const cost = parsePrice(
              first?.logisticPrice ?? first?.freight ?? first?.price ?? first?.totalAmount
            );
            return {
              ok: true,
              provider: 'cj_dropshipping',
              supplier_product_id: id,
              estimate: first?.logisticAging || first?.aging || '7-20 business days',
              shipping_cost_usd: cost || null,
              shipping_method: first?.logisticName || first?.name || null,
              country: countryCode || 'SA',
              status: 'connected',
              mock: false,
              live_api: true,
              options: options.slice(0, 5).map((o) => ({
                method: o.logisticName || o.name,
                cost_usd: parsePrice(o.logisticPrice ?? o.freight ?? o.price),
                estimate: o.logisticAging || o.aging,
              })),
            };
          }
        } else if (freight.ok && freight.data) {
          const options = extractList(freight.data) || (Array.isArray(freight.data) ? freight.data : [freight.data]);
          const first = options[0] || freight.data;
          const cost = parsePrice(
            first?.logisticPrice ?? first?.freight ?? first?.price ?? first?.totalAmount
          );
          return {
            ok: true,
            provider: 'cj_dropshipping',
            supplier_product_id: id,
            estimate: first?.logisticAging || first?.aging || '7-20 business days',
            shipping_cost_usd: cost || null,
            shipping_method: first?.logisticName || first?.name || null,
            country: countryCode || 'SA',
            status: 'connected',
            mock: false,
            live_api: true,
          };
        }
      }
    } catch {
      /* fall through to estimate */
    }
  }

  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: id,
    estimate: '7-15 business days to Saudi Arabia',
    shipping_cost_usd: null, // unknown — do not invent
    shipping_method: null,
    country: countryCode || 'SA',
    status: hasKey() ? 'connected' : 'not_configured',
    mock: !hasKey() || id.includes('DEMO'),
    note: 'Precise freight requires variant + destination; estimate only until freightCalculate succeeds',
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

/**
 * Order creation is intentionally NOT exported for automatic use.
 * Fulfillment must be admin-triggered and payment-confirmed.
 * This stub documents the interface for future SupplierProvider adapters.
 */
export async function createOrder(/* payload */) {
  return {
    ok: false,
    status: 'disabled',
    provider: 'cj_dropshipping',
    message: 'Live CJ order creation is disabled. Use admin dry-run / manual fulfillment only.',
    auto_purchase: false,
  };
}

export default {
  testConnection,
  searchProducts,
  getProductDetails,
  getVariants,
  getProductInventory,
  getProductPrice,
  getShippingInfo,
  getDemoCatalog,
  isConfigured,
  createOrder,
  provider: 'cj_dropshipping',
};
