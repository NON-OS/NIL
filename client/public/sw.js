// NONOS service worker. It makes the app installable and open instantly, and it never
// stores anything from /api: task data lives on your server, not in the browser's cache.
const SHELL = 'nonos-shell-v3';
const ASSETS = 'nonos-assets';
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Hashed build files never change, so the oldest can go once the cache grows past a cap.
async function keepAsset(request, response) {
  const cache = await caches.open(ASSETS);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname.startsWith('/.well-known/')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) event.waitUntil(keepAsset(request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }

  // Pages: always try the network for the newest app, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(caches.open(SHELL).then((cache) => cache.put('/', response.clone())));
          return response;
        })
        .catch(() => caches.match('/')),
    );
  }
});
