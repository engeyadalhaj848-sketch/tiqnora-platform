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
  if (Array.isArray(data)) {
    // listV2 returns content: [{ productList: [...products], keyWord, ... }]
    if (data.length && data[0] && Array.isArray(data[0].productList)) {
      return data.flatMap((w) => (Array.isArray(w.productList) ? w.productList : []));
    }
    return data;
  }
  // Official listV2 shape: data.content[0].productList
  if (Array.isArray(data.content) && data.content.length) {
    const flattened = data.content.flatMap((w) =>
      w && Array.isArray(w.productList) ? w.productList : w && (w.id || w.pid || w.nameEn) ? [w] : []
    );
    if (flattened.length) return flattened;
  }
  // Prefer non-empty arrays only (empty [] is truthy in JS — previous bug)
  const candidates = [
    data.productList,
    data.list,
    data.records,
    data.products,
    data.data?.productList,
    data.data?.list,
    data.data?.content,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      // Nested productList inside content-like wrappers
      if (c[0] && Array.isArray(c[0].productList)) {
        return c.flatMap((w) => (Array.isArray(w.productList) ? w.productList : []));
      }
      return c;
    }
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
    total: result.data?.totalRecords ?? result.data?.total ?? result.data?.totalCount ?? products.length,
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

  // product/query often returns stock=0 while listV2 has warehouse stock — backfill
  if (!mapped.stock || mapped.stock === 0) {
    try {
      const search = await searchProducts(mapped.title || id, 8);
      const found = (search.products || []).find(
        (p) => p.pid === id || p.supplier_product_id === id || p.sku === mapped.sku
      );
      if (found && found.stock > 0) {
        mapped.stock = found.stock;
        mapped.stock_source = 'listV2_backfill';
      }
    } catch {
      /* non-fatal */
    }
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

  // Official: GET /product/variant/query?pid=
  let result = await cjGet('/product/variant/query', { pid: id });
  if (!result.ok) {
    // some accounts accept productSku
    result = await cjGet('/product/variant/query', { productSku: id });
  }
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 'error',
      message: result.message,
      variants: [],
      provider: 'cj_dropshipping',
      endpoint: '/product/variant/query',
    };
  }

  // Response may be array or { variants / list / productList }
  let list = [];
  if (Array.isArray(result.data)) list = result.data;
  else if (result.data) {
    list =
      extractList(result.data) ||
      result.data.variants ||
      result.data.list ||
      result.data.productVariantList ||
      [];
  }
  if (!Array.isArray(list)) list = [];

  const variants = list
    .map((v) => {
      const vid = String(v.vid || v.variantId || v.id || '').trim();
      const weightRaw = v.variantWeight ?? v.weight ?? v.packWeight ?? null;
      let weight_g = null;
      if (weightRaw != null) {
        const n = Number(weightRaw);
        // CJ often returns kg as decimal < 50 or grams as larger ints
        if (Number.isFinite(n)) weight_g = n > 0 && n < 50 ? Math.round(n * 1000) : Math.round(n);
      }
      return {
        provider: 'cj',
        external_product_id: id,
        external_variant_id: vid || null,
        vid: vid || null,
        sku: v.variantSku || v.sku || v.productSku || null,
        variant_name: v.variantNameEn || v.variantName || v.name || v.variantKey || 'Default',
        attributes: v.variantKey || v.variantProperty || null,
        supplier_price: parsePrice(v.variantSellPrice ?? v.sellPrice ?? v.price ?? v.variantPrice),
        currency: 'USD',
        weight_g,
        image: v.variantImage || v.image || null,
        stock: Number(v.variantStock ?? v.stock ?? v.inventory ?? 0) || 0,
        variant_status: vid ? 'ok' : 'incomplete',
        raw: v,
      };
    })
    .filter((v) => v.vid || v.sku);

  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: id,
    variants,
    endpoint: '/product/variant/query',
    mock: false,
    live_api: true,
  };
}

/** Official inventory source: GET /product/stock/queryByVid?vid= */
export async function getInventoryByVid(vid) {
  const id = String(vid || '').trim();
  if (!id) {
    return { ok: false, status: 'error', message: 'vid required', inventory_source: 'cj_variant_inventory' };
  }
  if (!hasKey()) {
    return { ok: false, status: 'not_configured', message: 'Missing env: CJ_API_KEY', inventory_source: 'cj_variant_inventory' };
  }

  const result = await cjGet('/product/stock/queryByVid', { vid: id });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 'error',
      message: result.message,
      code: result.code,
      vid: id,
      inventory_source: 'cj_variant_inventory',
      warehouses: [],
      total_available_inventory: 0,
    };
  }

  const rows = Array.isArray(result.data) ? result.data : extractList(result.data) || [];
  const warehouses = (Array.isArray(rows) ? rows : []).map((w) => ({
    vid: w.vid || id,
    area_id: w.areaId || null,
    area_en: w.areaEn || w.areaName || null,
    country_code: w.countryCode || null,
    storage_num: Number(w.storageNum ?? w.totalInventoryNum ?? 0) || 0,
    cj_inventory: Number(w.cjInventoryNum ?? 0) || 0,
    factory_inventory: Number(w.factoryInventoryNum ?? 0) || 0,
    // Prefer CJ warehouse stock for dropship (not factory)
    available: Number(w.cjInventoryNum ?? w.storageNum ?? w.totalInventoryNum ?? 0) || 0,
  }));

  // Sum CJ warehouse availability only (avoid double-counting factory+cj if both listed as totals)
  const total = warehouses.reduce((s, w) => s + (Number(w.cj_inventory) || Number(w.available) || 0), 0);

  return {
    ok: true,
    provider: 'cj_dropshipping',
    vid: id,
    warehouses,
    total_available_inventory: total,
    inventory_source: 'cj_variant_inventory',
    endpoint: '/product/stock/queryByVid',
    mock: false,
    live_api: true,
  };
}

export async function getProductInventory(supplierProductId) {
  // Prefer variant-level inventory when possible
  const variants = await getVariants(supplierProductId);
  if (variants.ok && variants.variants?.length) {
    const withVid = variants.variants.filter((v) => v.vid);
    let total = 0;
    const detail = [];
    for (const v of withVid.slice(0, 5)) {
      const inv = await getInventoryByVid(v.vid);
      const qty = inv.ok ? inv.total_available_inventory : Number(v.stock) || 0;
      total += qty;
      detail.push({ vid: v.vid, sku: v.sku, stock: qty, inventory_source: inv.inventory_source, warehouses: inv.warehouses || [] });
      // QPS: 1/sec — caller should throttle; small delay via sequential awaits is enough if network latency >1s
    }
    return {
      ok: true,
      provider: 'cj_dropshipping',
      supplier_product_id: supplierProductId,
      stock: total,
      variants: detail,
      inventory_source: 'cj_variant_inventory',
      mock: false,
      live_api: true,
    };
  }

  const details = await getProductDetails(supplierProductId);
  if (!details.ok) {
    return {
      ok: false,
      status: details.status,
      stock: null,
      provider: 'cj_dropshipping',
      message: details.message,
      inventory_source: 'product_details_fallback',
    };
  }
  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: supplierProductId,
    stock: details.product?.stock ?? 0,
    variants: details.product?.variants || [],
    inventory_source: details.product?.stock_source || 'product_details_fallback',
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
 * Official: POST /logistic/freightCalculate
 * Body: { startCountryCode, endCountryCode, products: [{ vid, quantity }] }
 * Requires real VID — never invent.
 */
export async function getFreightByVid(vid, { countryCode = 'SA', quantity = 1, startCountryCode = 'CN' } = {}) {
  const id = String(vid || '').trim();
  if (!id || id.startsWith('DEMO')) {
    return {
      ok: false,
      status: 'error',
      message: 'Real vid required for freight',
      shipping_cost_source: 'unverified',
    };
  }
  if (!hasKey()) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'Missing env: CJ_API_KEY',
      shipping_cost_source: 'unverified',
    };
  }

  const body = {
    startCountryCode: startCountryCode || 'CN',
    endCountryCode: countryCode || 'SA',
    products: [{ vid: id, quantity: Math.max(1, Number(quantity) || 1) }],
  };

  const result = await cjRequest('POST', '/logistic/freightCalculate', { body });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status || 'error',
      message: result.message || 'freightCalculate failed',
      code: result.code,
      vid: id,
      country: countryCode || 'SA',
      shipping_cost_source: 'unverified',
      shipping_status: 'shipping_review',
      endpoint: '/logistic/freightCalculate',
      raw: result.raw || null,
    };
  }

  const optionsRaw = Array.isArray(result.data)
    ? result.data
    : extractList(result.data) || (result.data ? [result.data] : []);

  const options = optionsRaw
    .map((o) => ({
      shipping_method: o.logisticName || o.name || o.enName || null,
      logistic_name: o.logisticName || o.name || null,
      freight_cost: parsePrice(o.logisticPrice ?? o.postage ?? o.freight ?? o.price ?? o.totalPostageFee),
      currency: 'USD',
      delivery_days: o.logisticAging || o.aging || o.arrivalTime || null,
      estimated_delivery: o.logisticAging || o.aging || o.arrivalTime || null,
      taxes_fee: o.taxesFee != null ? Number(o.taxesFee) : null,
      total_postage_fee: o.totalPostageFee != null ? Number(o.totalPostageFee) : null,
    }))
    .filter((o) => o.freight_cost != null && o.freight_cost >= 0);

  if (!options.length) {
    return {
      ok: false,
      status: 'error',
      message: 'freightCalculate returned no priced options',
      vid: id,
      country: countryCode || 'SA',
      shipping_cost_source: 'unverified',
      shipping_status: 'shipping_review',
      options: [],
      endpoint: '/logistic/freightCalculate',
    };
  }

  // Prefer tracked mid-cost options: sort by cost, pick cheapest with a method name
  const sorted = [...options].sort((a, b) => a.freight_cost - b.freight_cost);
  const chosen = sorted[0];

  return {
    ok: true,
    provider: 'cj_dropshipping',
    vid: id,
    country: countryCode || 'SA',
    quantity: Math.max(1, Number(quantity) || 1),
    shipping_cost_usd: chosen.freight_cost,
    shipping_method: chosen.shipping_method,
    estimated_delivery: chosen.estimated_delivery,
    delivery_days: chosen.delivery_days,
    currency: 'USD',
    shipping_cost_source: 'cj_live_freight',
    shipping_status: 'verified',
    options: sorted.slice(0, 8),
    endpoint: '/logistic/freightCalculate',
    mock: false,
    live_api: true,
  };
}

/**
 * Shipping by product id — resolves first VID then freightCalculate.
 * Never invents cost; returns unverified if VID/freight missing.
 */
export async function getShippingInfo(supplierProductId, { countryCode = 'SA', quantity = 1, vid = null } = {}) {
  const id = String(supplierProductId || '').trim();
  if (!hasKey() && !id.includes('DEMO')) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'cj_dropshipping',
      message: 'Missing env: CJ_API_KEY',
      shipping_cost_source: 'unverified',
    };
  }

  let useVid = vid ? String(vid).trim() : null;
  if (!useVid) {
    const variants = await getVariants(id);
    useVid = variants.variants?.find((v) => v.vid)?.vid || null;
  }

  if (!useVid) {
    return {
      ok: true,
      provider: 'cj_dropshipping',
      supplier_product_id: id,
      estimate: null,
      shipping_cost_usd: null,
      shipping_method: null,
      country: countryCode || 'SA',
      status: 'shipping_review',
      shipping_cost_source: 'unverified',
      shipping_status: 'shipping_review',
      message: 'No VID available — cannot call freightCalculate',
      mock: false,
    };
  }

  const freight = await getFreightByVid(useVid, { countryCode, quantity });
  return {
    ...freight,
    supplier_product_id: id,
    vid: useVid,
  };
}

/**
 * Full pipeline audit for one product: variants → VID → inventory → SA freight → pricing inputs
 */
export async function auditProductPipeline(supplierProductId, { countryCode = 'SA' } = {}) {
  const pid = String(supplierProductId || '').trim();
  const variantsRes = await getVariants(pid);
  const variants = variantsRes.variants || [];
  const audited = [];

  // CJ QPS = 1/sec — audit at most 3 variants and pause between calls
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const v of variants.slice(0, 3)) {
    if (!v.vid) {
      audited.push({ ...v, variant_status: 'incomplete', inventory: null, freight: null });
      continue;
    }
    await sleep(1100);
    const inv = await getInventoryByVid(v.vid);
    await sleep(1100);
    const freight = await getFreightByVid(v.vid, { countryCode, quantity: 1 });
    audited.push({
      provider: 'cj',
      external_product_id: pid,
      external_variant_id: v.vid,
      vid: v.vid,
      sku: v.sku,
      variant_name: v.variant_name,
      attributes: v.attributes,
      supplier_price: v.supplier_price,
      weight_g: v.weight_g,
      inventory: inv,
      total_available_inventory: inv.total_available_inventory ?? 0,
      inventory_source: inv.inventory_source || 'cj_variant_inventory',
      freight,
      shipping_cost_usd: freight.ok ? freight.shipping_cost_usd : null,
      shipping_cost_source: freight.shipping_cost_source || 'unverified',
      shipping_method: freight.shipping_method || null,
      estimated_delivery: freight.estimated_delivery || null,
      shipping_status: freight.shipping_status || 'shipping_review',
    });
  }

  const publishable = audited.filter(
    (a) =>
      a.vid &&
      (a.total_available_inventory || 0) > 0 &&
      a.shipping_cost_source === 'cj_live_freight' &&
      a.shipping_cost_usd != null
  );

  return {
    ok: true,
    provider: 'cj_dropshipping',
    supplier_product_id: pid,
    variants_discovered: variants.length,
    vid_verified: audited.filter((a) => a.vid).length,
    inventory_verified: audited.filter((a) => (a.total_available_inventory || 0) > 0).length,
    freight_verified: audited.filter((a) => a.shipping_cost_source === 'cj_live_freight').length,
    variants: audited,
    primary: publishable[0] || audited[0] || null,
    publishable_count: publishable.length,
    mock: false,
    live_api: true,
    auto_purchase: false,
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
  getInventoryByVid,
  getFreightByVid,
  getProductInventory,
  getProductPrice,
  getShippingInfo,
  auditProductPipeline,
  getDemoCatalog,
  isConfigured,
  createOrder,
  provider: 'cj_dropshipping',
};
