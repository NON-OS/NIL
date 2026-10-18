// Just enough of a browser tab for the web app's state and action modules to run under Node: a
// window, local storage, a socket that never connects, and fetch answered by routes a test sets.
// Import it before any app module, since some of them touch the window as they load.
const saved = new Map();

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.document = { querySelector: () => null, createElement: () => ({ click() {}, remove() {} }), body: { append() {} }, addEventListener() {}, visibilityState: 'visible' };
globalThis.location = { protocol: 'https:', host: 'nil.example', pathname: '/', search: '', origin: 'https://nil.example', replace() {}, reload() {} };
globalThis.history = { replaceState() {}, pushState() {} };
globalThis.WebSocket = class {
  static OPEN = 1;
  send() {}
  close() {}
};
globalThis.localStorage = {
  get length() {
    return saved.size;
  },
  key: (i) => [...saved.keys()][i] ?? null,
  getItem: (k) => (saved.has(k) ? saved.get(k) : null),
  setItem: (k, v) => void saved.set(k, String(v)),
  removeItem: (k) => void saved.delete(k),
  clear: () => saved.clear(),
};

const routes = [];
// every request the app made, newest last, with its JSON body parsed
export const sent = [];

// Answers `method` requests whose URL matches `pattern` (a string or a RegExp) with `reply`'s
// return value. Later routes win over earlier ones.
export function route(method, pattern, reply) {
  routes.unshift({ method, test: (url) => (typeof pattern === 'string' ? url === pattern : pattern.test(url)), reply });
}

globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method ?? 'GET';
  let body = opts.body;
  try {
    body = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {}
  sent.push({ method, url, body });
  const match = routes.find((r) => r.method === method && r.test(url));
  if (!match) return new Response(JSON.stringify({ error: `no route for ${method} ${url}` }), { status: 404 });
  return new Response(JSON.stringify((await match.reply(url, body)) ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
