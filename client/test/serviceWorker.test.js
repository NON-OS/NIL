import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://acme.nil.test';
const SOURCE = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const sha = (text) => createHash('sha256').update(text).digest('hex');

// Cache Storage in memory, keyed by URL, the way the worker uses it.
function cacheStorage() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        match: async (request) => entries.get(request.url ?? new URL(request, ORIGIN).href)?.clone(),
        put: async (request, response) => void entries.set(request.url ?? new URL(request, ORIGIN).href, response),
        keys: async () => [...entries.keys()].map((url) => ({ url })),
        delete: async (request) => entries.delete(request.url),
        addAll: async () => {},
      });
    }
    return stores.get(name);
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request, { cacheName }) => (await open(cacheName)).match(request),
  };
}

// a response as the browser hands it to a worker for its own origin
function basic(body, { status = 200, type = 'application/javascript', headers = {} } = {}) {
  const response = new Response(body, { status, headers: { 'content-type': type, ...headers } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

// Runs sw.js against a fake browser: `server` answers each fetch by path.
function worker(server) {
  const listeners = {};
  const caches = cacheStorage();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting() {},
    clients: { claim: async () => {} },
  };
  const fetch = async (input) => server(new URL(input.url ?? input, ORIGIN).pathname);
  vm.runInThisContext(`(function (self, caches, fetch) {\n${SOURCE}\n})`)(self, caches, fetch);
  async function dispatch(type, init = {}) {
    const waits = [];
    let answer;
    const event = { ...init, respondWith: (p) => (answer = p), waitUntil: (p) => waits.push(p) };
    listeners[type](event);
    const response = await answer;
    await Promise.all(waits);
    return response;
  }
  return {
    caches,
    open: (path) => dispatch('fetch', { request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' } }),
    get: (path) => dispatch('fetch', { request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'cors' } }),
    stored: (path) => caches.stores.get('nonos-assets-v2')?.entries.has(`${ORIGIN}${path}`) ?? false,
  };
}

const PAGE = '<!doctype html><title>Nil</title>';

function site(files) {
  const state = { files: { ...files }, served: { ...files }, page: PAGE, status: 200, notice: null };
  state.build = () => ({ id: 'b1', files: Object.fromEntries(Object.entries({ '/index.html': state.page, ...state.files }).map(([p, text]) => [p, sha(text)])) });
  state.server = (path) => {
    if (path === '/build.json') return basic(JSON.stringify(state.build()), { type: 'application/json' });
    if (path.startsWith('/assets/')) return state.served[path] === undefined ? basic('Not found', { status: 404, type: 'text/plain' }) : basic(state.served[path]);
    if (state.status !== 200) return basic('<p>notice</p>', { status: state.status, type: 'text/html', headers: state.notice ? { 'x-nil-notice': state.notice } : {} });
    return basic(state.page, { type: 'text/html' });
  };
  return state;
}

test('a stored build file is checked against the build’s own list, and one changed on the way never stays', async () => {
  const s = site({ '/assets/app-1.js': 'real code' });
  const sw = worker(s.server);
  await sw.open('/');
  s.served['/assets/app-1.js'] = 'changed on the way';
  assert.equal((await sw.get('/assets/app-1.js')).type, 'error', 'bytes that differ from the list are refused');
  assert.equal(sw.stored('/assets/app-1.js'), false);

  s.served['/assets/app-1.js'] = 'real code';
  assert.equal(await (await sw.get('/assets/app-1.js')).text(), 'real code');
  assert.equal(sw.stored('/assets/app-1.js'), true);
  s.served['/assets/app-1.js'] = 'changed later';
  assert.equal(await (await sw.get('/assets/app-1.js')).text(), 'real code', 'a verified copy opens without asking the server');
});

test('a copy stored under a list that was itself changed is dropped on the next page load', async () => {
  const s = site({ '/assets/app-1.js': 'real code' });
  const sw = worker(s.server);
  // one moment where both the file and the list were changed on the way
  s.files['/assets/app-1.js'] = 'evil';
  s.served['/assets/app-1.js'] = 'evil';
  await sw.open('/');
  await sw.get('/assets/app-1.js');
  assert.equal(sw.stored('/assets/app-1.js'), true);
  s.files['/assets/app-1.js'] = 'real code';
  s.served['/assets/app-1.js'] = 'real code';
  await sw.open('/');
  assert.equal(sw.stored('/assets/app-1.js'), false, 'the next list doesn’t match it, so it goes');
  assert.equal(await (await sw.get('/assets/app-1.js')).text(), 'real code');
});

test('a paused or deleted workspace’s notice gets through; a restart still opens the stored app', async () => {
  const s = site({});
  const sw = worker(s.server);
  await sw.open('/');
  assert.equal(await (await sw.caches.match({ url: `${ORIGIN}/` }, { cacheName: 'nonos-shell-v5' })).text(), PAGE, 'the page matched its hash, so it was stored');
  s.status = 503;
  s.notice = 'suspended';
  const notice = await sw.open('/board');
  assert.equal(notice.status, 503);
  assert.equal(await notice.text(), '<p>notice</p>');
  s.notice = null;
  assert.equal(await (await sw.open('/board')).text(), PAGE, 'a 503 without a notice (a restart) shows the stored app');
  s.status = 502;
  assert.equal(await (await sw.open('/')).text(), PAGE);
});

test('a page that doesn’t match the build is not kept for offline use', async () => {
  const s = site({});
  s.build = () => ({ id: 'b1', files: { '/index.html': sha('another page') } });
  const sw = worker(s.server);
  await sw.open('/');
  assert.equal(await sw.caches.match({ url: `${ORIGIN}/` }, { cacheName: 'nonos-shell-v5' }), undefined);
});
