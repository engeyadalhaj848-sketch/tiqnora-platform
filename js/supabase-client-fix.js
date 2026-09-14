/* TIQNORA AI — robust Supabase browser loader */
(() => {
  const cfg = window.TIQNORA_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

  const exposeClient = () => {
    try {
      if (!window.supabase?.createClient || !window.TiqnoraDB) return false;
      const existing = window.TiqnoraDB.raw;
      if (existing) return true;
      const fixedClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      Object.defineProperty(window.TiqnoraDB, 'raw', {
        configurable: true,
        enumerable: true,
        get: () => fixedClient,
      });
      window.dispatchEvent(new Event('tiqnora:db-ready'));
      return true;
    } catch (err) {
      console.error('[tiqnora] Supabase fallback init failed:', err);
      return false;
    }
  };

  if (exposeClient()) return;

  const sources = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2'
  ];

  const load = (index = 0) => {
    if (index >= sources.length) {
      console.error('[tiqnora] Could not load Supabase browser client from any CDN.');
      return;
    }
    const script = document.createElement('script');
    script.src = sources[index];
    script.async = true;
    script.onload = () => {
      if (!exposeClient()) load(index + 1);
    };
    script.onerror = () => load(index + 1);
    document.head.appendChild(script);
  };

  load();
})();
