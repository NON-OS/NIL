// Just enough of a browser for the web app's action modules to run under Node, with a server
// the test scripts by hand: each route answers what a dishonest server might. Each test file
// runs in its own process, and reset() starts a fresh workspace within one.
import wallet from '../../../server/test/helpers/wallet.js';

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.document = { querySelector: () => null, createElement: () => ({ click() {}, remove() {} }), body: { append() {} }, addEventListener() {}, visibilityState: 'visible' };
globalThis.location = { protocol: 'https:', host: 'nil.example', pathname: '/', search: '', origin: 'https://nil.example', replace() {} };
globalThis.history = { replaceState() {}, pushState() {} };
globalThis.WebSocket = class {
  static OPEN = 1;
  send() {}
  close() {}
};
const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) },
});

const routes = [];
export const sent = [];
globalThis.fetch = async (url, opts = {}) => {
  const method = opts.method ?? 'GET';
  let body = opts.body;
  try {
    body = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {}
  sent.push({ method, url, body });
  for (let i = routes.length - 1; i >= 0; i--) {
    const r = routes[i];
    if (r.method === method && (typeof r.pattern === 'string' ? url === r.pattern : r.pattern.test(url))) {
      const data = await r.reply(url, body);
      return data instanceof Uint8Array ? new Response(data) : new Response(JSON.stringify(data ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ error: `no route ${method} ${url}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
};
export const route = (method, pattern, reply) => routes.push({ method, pattern, reply });

const load = (path) => import(`../../src/${path}.ts`).then((m) => m.default);
export const store = await load('state/store');
export const keyring = await load('state/keyring');
export const keyPins = await load('state/keyPins');
export const sealedCache = await load('state/sealedCache');
export const keyDirectory = await load('actions/keyDirectory');
const identityFromSeed = await load('lib/crypto/identityFromSeed');
const keyStatement = await load('lib/crypto/keyStatement');
export const b64u = await load('lib/crypto/b64u');

export const ORIGIN = 'https://nil.example';
let workspaceKey = 'workspace-key';
export const person = () => identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));

// A key directory entry signed by a wallet, as a member (or a wallet the server made) publishes it.
export function entry(userId, id, extra = {}) {
  const w = wallet();
  const fields = { userId, publicKey: b64u.encode(id.publicKey), signingKey: b64u.encode(id.signingKey), createdAt: Date.now(), address: w.address, active: true, ...extra };
  return { ...fields, signature: w.sign(keyStatement({ origin: ORIGIN, workspaceKey, ...fields })) };
}

// Signs `me` in with a copy of `identity` unlocked, since locking wipes the one it holds; users
// are { id, name, deactivated? }.
export function signIn(me, identity, users) {
  keyring.lock();
  sealedCache.clear();
  store.set((s) => ({ phase: 'ready', origin: ORIGIN, workspaceKey, me: { id: me, name: me }, users: Object.fromEntries(users.map((u) => [u.id, { deactivated: false, kind: 'human', ...u }])), docsUnlocked: true, tasks: {}, keysRev: s.keysRev + 1 }));
  if (identity) keyring.unlock({ ...identity, seed: identity.seed.slice(), privateKey: identity.privateKey.slice(), signingPrivate: identity.signingPrivate.slice() });
}

// A fresh workspace: no routes, no storage, nothing unlocked.
export function reset() {
  routes.length = 0;
  sent.length = 0;
  memory.clear();
  workspaceKey = `workspace-${b64u.encode(crypto.getRandomValues(new Uint8Array(6)))}`;
}

// Confirms these people's keys the way the prompt does: exactly the keys it shows.
export async function confirm(userIds) {
  await keyDirectory.confirm((await keyDirectory.pending(userIds)).filter((k) => userIds.includes(k.userId)));
}
