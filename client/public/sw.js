// Nil service worker. It makes the app installable and open instantly, and it never stores
// anything from /api: task data lives on your server, not in the browser's cache.
const SHELL = 'nonos-shell-v4';
const ASSETS = 'nonos-assets';
const MAX_ASSETS = 120;

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

const typeOf = (response) => (response.headers.get('Content-Type') || '').toLowerCase();

// Only a real build file is kept. A server that answers a missing file with the app's page
// (an older Nil, or a misconfigured proxy) must never have that page stored as a script or a
// stylesheet, where it would break every later load of that file.
function isBuildFile(response) {
  return response.ok && response.type === 'basic' && !typeOf(response).startsWith('text/html');
}

// Hashed build files never change, so the oldest can go once the cache grows past a cap.
async function keepAsset(request, response) {
  const cache = await caches.open(ASSETS);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
}

// The newest app from the network, stored for offline use. While the server is unreachable or
// restarting for a deploy, the stored one opens instead of an error page.
async function page(event) {
  try {
    const response = await fetch(event.request);
    if (response.ok && typeOf(response).startsWith('text/html')) {
      const copy = response.clone();
      event.waitUntil(caches.open(SHELL).then((cache) => cache.put('/', copy)));
      return response;
    }
    if (response.status >= 500) return (await caches.match('/')) || response;
    return response;
  } catch {
    return (await caches.match('/')) || Response.error();
  }
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
            if (isBuildFile(response)) event.waitUntil(keepAsset(request, response.clone()));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') event.respondWith(page(event));
});
