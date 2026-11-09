/* الإحصائيات — offline cache for the iPhone/web version */
const CACHE = 'ihsaat-v1';
const SHELL = [
  './', './index.html', './style.css', './app.js', './vendor/xlsx.full.min.js', './manifest.webmanifest',
  './fonts/cairo-arabic-400-normal.woff2', './fonts/cairo-arabic-700-normal.woff2',
  './fonts/cairo-latin-400-normal.woff2', './fonts/cairo-latin-700-normal.woff2',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Same-origin files: network first (so updates arrive), cache as fallback when offline.
// Requests to the Google Sheet server are never touched.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
