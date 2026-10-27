// Nil service worker. It makes the app installable and open instantly, and it never stores
// anything from /api: task data lives on your server, not in the browser's cache.
const SHELL = 'nonos-shell-v5';
const ASSETS = 'nonos-assets-v2';
const MAX_ASSETS = 120;
// the SHA-256 this worker computed itself when it stored a response
const HASH = 'X-Nil-Sha256';

// The build the last page load came from: its id and the SHA-256 of the page and every file
// under /assets (build.json). Fetched fresh on every page load and kept in memory only, so a
// list changed once on the way can't stay either. `loading` is the request in flight.
let build = null;
let loading = null;
let pruned = null;

const typeOf = (response) => (response.headers.get('Content-Type') || '').toLowerCase();
const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (response) => hex(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()));

// Only a real build file is kept. A server that answers a missing file with the app's page
// (an older Nil, or a misconfigured proxy) must never have that page stored as a script or a
// stylesheet, where it would break every later load of that file.
function isBuildFile(response) {
  return response.ok && response.type === 'basic' && !typeOf(response).startsWith('text/html');
}

// Stored files that the current build doesn't list with the same hash go: an older build's,
// and any that were changed on the way when they were stored.
async function prune(files) {
  const key = JSON.stringify(files);
  if (key === pruned) return;
  const cache = await caches.open(ASSETS);
  for (const request of await cache.keys()) {
    const stored = await cache.match(request);
    if (!stored || stored.headers.get(HASH) !== files[new URL(request.url).pathname]) await cache.delete(request);
  }
  pruned = key;
}

async function loadBuild() {
  try {
    const response = await fetch('/build.json', { cache: 'no-store', credentials: 'same-origin' });
    const next = response.ok ? await response.json() : null;
    if (next && typeof next.files === 'object' && next.files) {
      build = next;
      await prune(next.files);
    }
  } catch {}
  return build;
}

async function keepAsset(request, response, hash) {
  const headers = new Headers(response.headers);
  headers.set(HASH, hash);
  const cache = await caches.open(ASSETS);
  await cache.put(request, new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers }));
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(old);
}

// Build files are named after their contents, so a stored one opens without asking the
// server, but only while the current build lists it with the hash it was stored under. One
// that the build lists with other bytes was changed on the way and is refused.
async function asset(event) {
  const { request } = event;
  const path = new URL(request.url).pathname;
  const files = (await (loading || Promise.resolve(build)))?.files || null;
  const hit = await caches.match(request, { cacheName: ASSETS });
  if (hit && (!files || hit.headers.get(HASH) === files[path])) return hit;
  const response = await fetch(request);
  if (!isBuildFile(response) || !files || !files[path]) return response;
  const hash = await sha256(response);
  if (hash !== files[path]) return Response.error();
  event.waitUntil(keepAsset(request, response.clone(), hash));
  return response;
}

// The page is stored for offline use only if it is the one the build lists.
async function keepShell(response) {
  const expected = (await (loading || Promise.resolve(build)))?.files?.['/index.html'];
  if (!expected || (await sha256(response)) !== expected) return;
  await (await caches.open(SHELL)).put('/', response);
}

self.addEventListener('install', (event) => {
  loading = loadBuild();
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((cache) => cache.addAll(['/favicon.svg', '/manifest.webmanifest'])),
      fetch('/', { cache: 'no-store' }).then((response) => (response.ok ? keepShell(response) : null)).catch(() => {}),
    ]),
  );
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

// The newest app from the network, stored for offline use. While the server is unreachable or
// restarting for a deploy, the stored one opens instead of an error page. A host's notice that
// this workspace is paused or being deleted (503 with X-Nil-Notice) is shown as it is, never
// covered up by the stored app.
async function page(event) {
  loading = loadBuild();
  try {
    const response = await fetch(event.request);
    if (response.ok && typeOf(response).startsWith('text/html')) {
      event.waitUntil(keepShell(response.clone()));
      return response;
    }
    if (response.status === 503 && response.headers.get('X-Nil-Notice')) return response;
    if (response.status >= 500) return (await caches.match('/', { cacheName: SHELL })) || response;
    return response;
  } catch {
    return (await caches.match('/', { cacheName: SHELL })) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws' || url.pathname.startsWith('/.well-known/')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(event));
    return;
  }

  if (request.mode === 'navigate') event.respondWith(page(event));
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
      // a ring stays up until it's answered or replaced by "Missed call"
      requireInteraction: Boolean(text(message.call)),
      data: { task: text(message.task) || null, chat: message.chat === true, call: text(message.call) || null },
    }),
  );
});

// Focuses a Nil window that's already open and tells it which task to show, or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.task ?? null;
  // a chat message's push names nothing, so it opens chat itself
  const chat = event.notification.data?.chat === true;
  const callId = event.notification.data?.call ?? null;
  // a ring or a missed call opens the Calls page, where a ring waits to be answered
  const call = Boolean(callId) || String(event.notification.tag || '').startsWith('nil-call-');
  const url = call ? `/calls${callId ? `?call=${encodeURIComponent(callId)}` : ''}` : chat ? '/chat' : taskId ? `/?open-task=${encodeURIComponent(taskId)}` : '/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      await open.focus();
      if (call) open.postMessage({ type: 'nil:call', callId });
      else open.postMessage({ type: 'nil:open', taskId, chat });
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
