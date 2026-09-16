/* Tiqnora Admin — minimal offline shell for PWA install */
const CACHE = 'tiqnora-admin-v1';
const SHELL = ['/admin.html', '/admin.css', '/js/config.js', '/assets/tiqnora-logo.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache API or auth
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    return;
  }
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(res => {
      const copy = res.clone();
      if (res.ok && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.html'))) {
        caches.open(CACHE).then(c => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('/admin.html')))
  );
});
