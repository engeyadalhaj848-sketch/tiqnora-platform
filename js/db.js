/* ============================================================
   TIQNORA AI — Data Access Layer (Supabase + static fallback)
   ------------------------------------------------------------
   - Reads published content from Supabase when configured.
   - Falls back to the bundled default content otherwise
     (site never breaks).
   - Caches DB results in a versioned localStorage namespace for 5 minutes.
   - Admin writes happen through this same client (auth session).
   ============================================================ */
(() => {
  const cfg = window.TIQNORA_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  let client = null;
  let resolveReady;
  const readyPromise = new Promise(resolve => { resolveReady = resolve; });
  const restUrl = enabled ? `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1` : '';

  async function fromRest(table, select = '*', order = null, extra = null) {
    if (!enabled) return null;
    const params = new URLSearchParams({ select });
    if (order) params.set('order', `${order.col}.${order.asc === false ? 'desc' : 'asc'}`);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v != null && v !== '') params.set(k, String(v));
      });
    }
    try {
      const headers = {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
      };
      if (extra && extra._count) headers['Prefer'] = 'count=exact';
      const qs = params.toString().replace('_count=true&', '').replace('&_count=true', '').replace('_count=true', '');
      const res = await fetch(`${restUrl}/${table}?${qs}`, { headers });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      if (extra && extra._count) {
        const cr = res.headers.get('content-range') || '';
        const total = cr.includes('/') ? Number(cr.split('/')[1]) : (Array.isArray(data) ? data.length : 0);
        return { data, total: Number.isFinite(total) ? total : (Array.isArray(data) ? data.length : 0) };
      }
      return data;
    } catch (error) {
      console.warn('[tiqnora] rest:', table, error.message);
      return null;
    }
  }

  function finishClientLoad(ok) {
    if (ok) window.dispatchEvent(new Event('tiqnora:db-ready'));
    resolveReady(ok);
  }

  function loadSupabaseClient(index = 0) {
    const sources = [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd.min.js',
      'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
    ];
    if (window.supabase?.createClient) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      finishClientLoad(true);
      return;
    }
    if (index >= sources.length) {
      console.error('[tiqnora] Unable to load the Supabase browser client.');
      finishClientLoad(false);
      return;
    }
    const s = document.createElement('script');
    let settled = false;
    const retry = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s.remove();
      loadSupabaseClient(index + 1);
    };
    const timer = setTimeout(retry, 6000);
    s.src = sources[index];
    s.async = true;
    s.onload = () => {
      if (!window.supabase?.createClient) return retry();
      settled = true;
      clearTimeout(timer);
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      finishClientLoad(true);
    };
    s.onerror = retry;
    document.head.appendChild(s);
  }

  if (enabled) loadSupabaseClient();
  else finishClientLoad(false);

  const CACHE_PREFIX = 'tiqnora-db-v2-';
  const CACHE_TTL = 5 * 60 * 1000;

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t > CACHE_TTL) return null;
      return d;
    } catch { return null; }
  }
  function cacheSet(key, data) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
  }

  async function fromDb(table, select = '*', order = null) {
    if (!client) return fromRest(table, select, order);
    let q = client.from(table).select(select);
    if (order) q = q.order(order.col, { ascending: order.asc !== false });
    const { data, error } = await q;
    if (error) { console.warn('[tiqnora] db:', table, error.message); return null; }
    return data;
  }

  /* ---------- public API ---------- */
  window.TiqnoraDB = {
    get isConfigured() { return enabled; },
    get raw() { return client; },
    ready() {
      return readyPromise;
    },

    async getServices() {
      const cached = cacheGet('services'); if (cached) return cached;
      const rows = await fromDb('services', '*,categories(slug,name_ar,name_en )', { col: 'sort_order' });
      if (!rows) return null;
      cacheSet('services', rows); return rows;
    },
    async getPackages() {
      const cached = cacheGet('packages'); if (cached) return cached;
      const rows = await fromDb('packages', '*', { col: 'sort_order' });
      if (!rows) return null;
      cacheSet('packages', rows); return rows;
    },
    /* Slim fields for product cards — no long descriptions / internal costs */
    _productCardSelect() {
      return 'id,slug,name_ar,name_en,price,discount_percent,stock_quantity,track_stock,images,is_active,featured,sort_order,categories(slug,name_ar),brands(slug,name)';
    },
    _productDetailSelect() {
      return 'id,slug,sku,name_ar,name_en,description_ar,description_en,delivery_note_ar,delivery_note_en,price,discount_percent,stock_quantity,track_stock,images,is_active,featured,sort_order,specifications,categories(slug,name_ar,name_en),brands(slug,name)';
    },
    _mapPublicProduct(r) {
      if (!r) return null;
      return {
        id: r.id,
        slug: r.slug,
        sku: r.sku,
        name_ar: r.name_ar,
        name_en: r.name_en,
        description_ar: r.description_ar,
        description_en: r.description_en,
        delivery_note_ar: r.delivery_note_ar,
        delivery_note_en: r.delivery_note_en,
        price: r.price,
        discount_percent: r.discount_percent,
        stock_quantity: r.stock_quantity,
        track_stock: r.track_stock,
        images: Array.isArray(r.images) ? r.images : [],
        is_active: r.is_active,
        featured: r.featured,
        sort_order: r.sort_order,
        specifications: r.specifications,
        categories: r.categories,
        brands: r.brands,
      };
    },

    /** Full active catalog (slim fields). Prefer getProductsPage for shop. */
    async getProducts() {
      const cached = cacheGet('products-slim-v2'); if (cached) return cached;
      if (!client && !enabled) return null;
      if (client) {
        const { data, error } = await client
          .from('products')
          .select(this._productCardSelect())
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .limit(200);
        if (error || !data) return null;
        const publicRows = data.map((r) => this._mapPublicProduct(r));
        cacheSet('products-slim-v2', publicRows);
        return publicRows;
      }
      const rows = await fromRest('products', this._productCardSelect(), { col: 'sort_order' }, { 'is_active': 'eq.true', limit: '200' });
      if (!rows) return null;
      const publicRows = (Array.isArray(rows) ? rows : []).map((r) => this._mapPublicProduct(r));
      cacheSet('products-slim-v2', publicRows);
      return publicRows;
    },

    /**
     * Paginated storefront catalog — server-side range, active only, card fields.
     * @returns {{ items: Array, total: number, hasMore: boolean }}
     */
    async getProductsPage({ limit = 12, offset = 0, cat = null, brand = null, q = null } = {}) {
      const lim = Math.min(48, Math.max(1, Number(limit) || 12));
      const off = Math.max(0, Number(offset) || 0);
      const cacheKey = `prod-page-v2-${lim}-${off}-${cat || ''}-${brand || ''}-${(q || '').slice(0, 40)}`;
      const cached = cacheGet(cacheKey);
      if (cached) return cached;

      const mapRows = (rows) => (rows || []).map((r) => this._mapPublicProduct(r));

      if (client) {
        let query = client
          .from('products')
          .select(this._productCardSelect(), { count: 'exact' })
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .range(off, off + lim - 1);
        // Note: nested filter on categories.slug requires !inner in some setups; filter client-side if needed
        const { data, error, count } = await query;
        if (error) {
          console.warn('[tiqnora] getProductsPage', error.message);
          return null;
        }
        let items = mapRows(data);
        if (cat) items = items.filter((p) => p.categories?.slug === cat);
        if (brand) items = items.filter((p) => p.brands?.slug === brand);
        if (q) {
          const qq = String(q).toLowerCase();
          items = items.filter((p) =>
            (p.name_ar || '').toLowerCase().includes(qq) ||
            (p.name_en || '').toLowerCase().includes(qq)
          );
        }
        const total = typeof count === 'number' ? count : items.length;
        const result = { items, total, hasMore: off + lim < total };
        cacheSet(cacheKey, result);
        return result;
      }

      if (!enabled) return null;
      const extra = {
        'is_active': 'eq.true',
        limit: String(lim),
        offset: String(off),
        _count: true,
      };
      const pack = await fromRest('products', this._productCardSelect(), { col: 'sort_order' }, extra);
      if (!pack) return null;
      const rows = Array.isArray(pack.data) ? pack.data : (Array.isArray(pack) ? pack : []);
      let items = mapRows(rows);
      const total = pack.total != null ? pack.total : items.length;
      const result = { items, total, hasMore: off + lim < total };
      cacheSet(cacheKey, result);
      return result;
    },

    /** Single product by slug — avoids loading entire catalog on product page */
    async getProductBySlug(slug) {
      if (!slug) return null;
      const cacheKey = 'prod-slug-v2-' + slug;
      const cached = cacheGet(cacheKey); if (cached) return cached;
      if (client) {
        const { data, error } = await client
          .from('products')
          .select(this._productDetailSelect())
          .eq('slug', slug)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        const row = this._mapPublicProduct(data);
        cacheSet(cacheKey, row);
        return row;
      }
      if (!enabled) return null;
      const rows = await fromRest(
        'products',
        this._productDetailSelect(),
        null,
        { slug: `eq.${slug}`, is_active: 'eq.true', limit: '1' }
      );
      const row = Array.isArray(rows) && rows[0] ? this._mapPublicProduct(rows[0]) : null;
      if (row) cacheSet(cacheKey, row);
      return row;
    },
    async getCategories(type) {
      const cached = cacheGet('cat-' + type); if (cached) return cached;
      const rows = await fromDb('categories', '*', { col: 'sort_order' });
      if (!rows) return null;
      const filtered = type ? rows.filter(r => r.type === type) : rows;
      cacheSet('cat-' + type, filtered); return filtered;
    },
    async getBrands() { return fromDb('brands', '*', { col: 'sort_order' }); },
    async getSettings() {
      const cached = cacheGet('settings'); if (cached) return cached;
      if (!client) return null;
      const { data, error } = await client.from('site_settings').select('key, value');
      if (error || !data) return null;
      const map = {};
      data.forEach(r => map[r.key] = r.value);
      cacheSet('settings', map); return map;
    },
    async getMedia() { return fromDb('media', '*', { col: 'created_at', asc: false }); },
    async getAiAgents() { return fromDb('ai_agents', '*', { col: 'created_at' }); },
    async getPages() { return fromDb('pages', '*', { col: 'sort_order' }); },
    async getShippingSettings() { return fromDb('shipping_settings', '*', { col: 'provider' }); },
    async logPageView(path) {
      if (!client) return;
      client.from('page_views').insert({ path: path || location.pathname }).then(() => {}, () => {});
    },

    clearCache() {
      Object.keys(localStorage)
        .filter(k => k.startsWith('tiqnora-db-'))
        .forEach(k => localStorage.removeItem(k));
    },

    /* ---------- store actions ---------- */
    async submitLead(name, email, message) {
      if (!client) return { ok: false, fallback: 'mailto' };
      const { error } = await client.from('leads').insert({ name, email, message });
      return { ok: !error, fallback: error ? 'mailto' : null };
    },

    async placeOrder(order) {
      if (!client) return { ok: false, error: 'db_not_configured' };
      const { data: o, error } = await client.from('orders').insert(order).select('id, order_number').single();
      if (error) return { ok: false, error: error.message };
      const items = (order.items || []).map(it => ({
        order_id: o.id, item_type: it.kind, ref_id: it.refId || null,
        title_ar: it.titleAr || '', title_en: it.titleEn || '',
        unit_price: it.price, quantity: it.qty || 1,
        line_total: it.price * (it.qty || 1)
      }));
      if (items.length) await client.from('order_items').insert(items);
      return { ok: true, order: o };
    },

    async validateCoupon(code, subtotal) {
      if (!client || !code) return { valid: false };
      const { data, error } = await client.rpc('validate_coupon', { p_code: code, p_subtotal: subtotal });
      if (error || !data || !data.length) return { valid: false };
      return data[0];
    },

    async trackOrder(orderNumber) {
      if (!client) return null;
      const { data, error } = await client.rpc('track_order', { p_order_number: orderNumber });
      if (error || !data || !data.length) return null;
      return data[0];
    }
  };
})();
