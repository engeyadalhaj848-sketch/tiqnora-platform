/* ============================================================
   TIQNORA AI — Data Access Layer (Supabase + static fallback)
   ------------------------------------------------------------
   - Reads published content from Supabase when configured.
   - Falls back to the bundled default content otherwise
     (site never breaks).
   - Caches DB results in localStorage for 5 minutes.
   - Admin writes happen through this same client (auth session).
   ============================================================ */
(() => {
  const cfg = window.TIQNORA_CONFIG || {};
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  let client = null;
  const restUrl = enabled ? `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1` : '';

  async function fromRest(table, select = '*', order = null) {
    if (!enabled) return null;
    const params = new URLSearchParams({ select });
    if (order) params.set('order', `${order.col}.${order.asc === false ? 'desc' : 'asc'}`);
    try {
      const res = await fetch(`${restUrl}/${table}?${params.toString()}`, {
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (error) {
      console.warn('[tiqnora] rest:', table, error.message);
      return null;
    }
  }

  if (enabled) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd.min.js';
    s.onload = () => { client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); window.dispatchEvent(new Event('tiqnora:db-ready')); };
    document.head.appendChild(s);
  }

  const CACHE_PREFIX = 'tiqnora-db-';
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
      if (!enabled) return Promise.resolve(false);
      if (client) return Promise.resolve(true);
      return new Promise(res => {
        const to = setTimeout(() => res(false), 8000);
        window.addEventListener('tiqnora:db-ready', () => { clearTimeout(to); res(true); }, { once: true });
      });
    },

    async getServices() {
      const cached = cacheGet('services'); if (cached) return cached;
      const rows = await fromDb('services', '*, categories(slug, name_ar, name_en)', { col: 'sort_order' });
      if (!rows) return null;
      cacheSet('services', rows); return rows;
    },
    async getPackages() {
      const cached = cacheGet('packages'); if (cached) return cached;
      const rows = await fromDb('packages', '*', { col: 'sort_order' });
      if (!rows) return null;
      cacheSet('packages', rows); return rows;
    },
    async getProducts() {
      const cached = cacheGet('products'); if (cached) return cached;
      const rows = await fromDb('products', '*, categories(slug, name_ar, name_en), brands(slug, name)', { col: 'sort_order' });
      if (!rows) return null;
      cacheSet('products', rows); return rows;
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
        .filter(k => k.startsWith(CACHE_PREFIX))
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
