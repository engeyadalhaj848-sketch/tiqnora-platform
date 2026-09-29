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
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
      'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    ];
    if (!enabled) { finishClientLoad(false); return; }
    if (index >= sources.length) { finishClientLoad(false); return; }
    const s = document.createElement('script');
    s.src = sources[index];
    s.async = true;
    s.onload = () => {
      try {
        if (window.supabase) {
          client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          finishClientLoad(true);
        } else loadSupabaseClient(index + 1);
      } catch (e) {
        console.warn('[tiqnora] supabase init', e);
        loadSupabaseClient(index + 1);
      }
    };
    s.onerror = () => loadSupabaseClient(index + 1);
    document.head.appendChild(s);
  }
  loadSupabaseClient();

  const CACHE_NS = 'tiqnora-db-v2';
  const CACHE_TTL = 5 * 60 * 1000;
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_NS + ':' + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.t || Date.now() - parsed.t > CACHE_TTL) return null;
      return parsed.v;
    } catch (_) { return null; }
  }
  function cacheSet(key, value) {
    try {
      localStorage.setItem(CACHE_NS + ':' + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (_) {}
  }

  async function fromDb(table, select = '*', order = null) {
    if (client) {
      let q = client.from(table).select(select);
      if (order) q = q.order(order.col, { ascending: order.asc !== false });
      const { data, error } = await q;
      if (error) { console.warn('[tiqnora] db', table, error.message); return null; }
      return data;
    }
    return fromRest(table, select, order);
  }

  window.TiqnoraDB = {
    ready: readyPromise,
    isEnabled: () => enabled,
    getClient: () => client,

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

    async getProductsPage({ limit = 12, offset = 0, cat = null, brand = null, q = null } = {}) {
      const lim = Math.min(48, Math.max(1, Number(limit) || 12));
      const off = Math.max(0, Number(offset) || 0);
      const safeQ = String(q || '').trim().slice(0, 40);
      const cacheKey = `prod-page-v4-${lim}-${off}-${cat || ''}-${brand || ''}-${safeQ}`;
      const cached = cacheGet(cacheKey);
      if (cached) return cached;

      const mapRows = (rows) => (rows || []).map((r) => this._mapPublicProduct(r));

      // Preferred path: SECURITY DEFINER RPC (survives RLS policy mistakes on is_admin)
      if (enabled && restUrl) {
        try {
          const headers = {
            apikey: cfg.supabaseAnonKey,
            Authorization: `Bearer ${cfg.supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          };
          const res = await fetch(`${restUrl}/rpc/get_storefront_products`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              p_limit: lim,
              p_offset: off,
              p_cat: cat || null,
              p_brand: brand || null,
              p_q: safeQ || null,
            }),
          });
          if (res.ok) {
            const body = await res.json();
            const payload = body && body.items ? body : (Array.isArray(body) ? body[0] : body);
            if (payload && Array.isArray(payload.items)) {
              const items = mapRows(payload.items);
              const total = Number(payload.total) || items.length;
              const result = {
                items,
                total,
                hasMore: payload.hasMore != null ? !!payload.hasMore : off + lim < total,
              };
              cacheSet(cacheKey, result);
              return result;
            }
          }
        } catch (e) {
          console.warn('[tiqnora] storefront rpc:', e.message || e);
        }
      }

      // Fast path for the public store: call PostgREST directly.
      if (enabled) {
        let select = this._productCardSelect();
        if (cat) select = select.replace('categories(', 'categories!inner(');
        if (brand) select = select.replace('brands(', 'brands!inner(');
        const extra = {
          is_active: 'eq.true',
          limit: String(lim),
          offset: String(off),
          _count: true,
        };
        if (cat) extra['categories.slug'] = `eq.${cat}`;
        if (brand) extra['brands.slug'] = `eq.${brand}`;
        if (safeQ) {
          const clean = safeQ.replace(/[,*()]/g, ' ').trim();
          if (clean) extra.or = `(name_ar.ilike.*${clean}*,name_en.ilike.*${clean}*)`;
        }
        const pack = await fromRest('products', select, { col: 'sort_order' }, extra);
        if (pack) {
          const rows = Array.isArray(pack.data) ? pack.data : (Array.isArray(pack) ? pack : []);
          const items = mapRows(rows);
          const total = pack.total != null ? pack.total : items.length;
          const result = { items, total, hasMore: off + lim < total };
          cacheSet(cacheKey, result);
          return result;
        }
      }

      // Fallback to the loaded Supabase client only if direct REST failed.
      if (client) {
        let select = this._productCardSelect();
        if (cat) select = select.replace('categories(', 'categories!inner(');
        if (brand) select = select.replace('brands(', 'brands!inner(');
        let query = client
          .from('products')
          .select(select, { count: 'exact' })
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .range(off, off + lim - 1);
        if (cat) query = query.eq('categories.slug', cat);
        if (brand) query = query.eq('brands.slug', brand);
        if (safeQ) {
          const clean = safeQ.replace(/[,*()]/g, ' ').trim();
          if (clean) query = query.or(`name_ar.ilike.%${clean}%,name_en.ilike.%${clean}%`);
        }
        const { data, error, count } = await query;
        if (error) {
          console.warn('[tiqnora] getProductsPage', error.message);
          return null;
        }
        const items = mapRows(data || []);
        const total = typeof count === 'number' ? count : items.length;
        const result = { items, total, hasMore: off + lim < total };
        cacheSet(cacheKey, result);
        return result;
      }
      return null;
    },

    async getProductBySlug(slug) {
      if (!slug) return null;
      const key = 'prod-' + slug;
      const cached = cacheGet(key); if (cached) return cached;
      if (client) {
        const { data, error } = await client
          .from('products')
          .select(this._productDetailSelect())
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();
        if (error || !data) return null;
        const mapped = this._mapPublicProduct(data);
        cacheSet(key, mapped);
        return mapped;
      }
      const rows = await fromRest('products', this._productDetailSelect(), null, {
        slug: `eq.${slug}`,
        is_active: 'eq.true',
        limit: '1',
      });
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (!row) return null;
      const mapped = this._mapPublicProduct(row);
      cacheSet(key, mapped);
      return mapped;
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
      client.from('page_views').insert({ path: path || location.pathname }).then(() => {}).catch(() => {});
    },
  };
})();
