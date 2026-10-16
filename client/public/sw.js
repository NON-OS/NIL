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

// ---------------------------------------------------------------------------------------------
// Push notifications. Separate from the caching above: this part only shows what the server
// pushed, opens the right task when a notification is clicked, and keeps the subscription alive.
// ---------------------------------------------------------------------------------------------

// Every push is shown: Safari takes push away from sites that receive one without showing it.
// The message holds only what the person allowed; for a private task that's "Reminder" or
// "A private task is due" and the task's id, never its words.
self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {}
  const text = (value) => (typeof value === 'string' ? value : '');
  event.waitUntil(
    self.registration.showNotification(text(message.title) || 'Nil', {
      body: text(message.body),
      tag: text(message.tag) || undefined,
      icon: '/icons/icon-192.png',
      data: { task: text(message.task) || null },
    }),
  );
});

// Focuses a Nil window that's already open and tells it which task to show, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.task ?? null;
  const url = taskId ? `/?open-task=${encodeURIComponent(taskId)}` : '/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      open.postMessage({ type: 'nil:open', taskId });
    }),
  );
});

// A browser sometimes swaps a subscription on its own. The new one goes to the server in place
// of the old, which the server accepts only from the person the old one belonged to.
self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  const key = old?.options?.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((fresh) =>
        fetch('/api/push/subscription', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' },
          body: JSON.stringify({ endpoint: fresh.endpoint, keys: fresh.toJSON().keys, replaces: old.endpoint }),
        }),
      )
      .catch(() => {}),
  );
});
