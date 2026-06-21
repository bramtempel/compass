const CACHE = 'compass-v2';
const SHELL = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/app.js', './js/config.js', './js/db.js', './js/drive.js', './js/embed.js',
  './js/search.js', './js/library.js', './js/captures.js', './js/suggestions.js',
  './js/bespoke.js', './js/sync.js', './js/ui.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // let Drive/CDN/GIS pass through
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => hit))
  );
});
