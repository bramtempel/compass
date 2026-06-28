const CACHE = 'compass-v9';        // app shell (network-first; bumped per release)
const ASSETS = 'compass-assets';   // heavy vendor runtime (cache-first; persists across releases)
const SHELL = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/app.js', './js/config.js', './js/db.js', './js/drive.js', './js/embed.js',
  './js/search.js', './js/library.js', './js/captures.js', './js/suggestions.js',
  './js/bespoke.js', './js/sync.js', './js/ui.js', './js/images.js', './js/merge.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Drop OLD compass shells, but KEEP the current shell, the vendor assets, and
  // never touch 'transformers-cache' (the model) — so big files don't re-download.
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys
      .filter(k => k.startsWith('compass-') && k !== CACHE && k !== ASSETS)
      .map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Drive/HF pass through

  // Vendor runtime (engine + WASM): cache-first, persistent — download once.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(ASSETS).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    })));
    return;
  }

  // App shell: network-first (fresh code online), cache fallback offline.
  e.respondWith(fetch(e.request).then(resp => {
    const copy = resp.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
    return resp;
  }).catch(() => caches.match(e.request)));
});
