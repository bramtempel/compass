const CACHE = 'compass-v7';
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
  // Only drop OLD compass shells — never touch 'transformers-cache' (the ~120MB model)
  // or any other app's cache, or the model re-downloads on every version bump.
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('compass-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // let Drive/CDN/GIS pass through
  // NETWORK-FIRST: always serve fresh app code when online; fall back to cache offline.
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
