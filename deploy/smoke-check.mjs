// Run inside a throwaway Nil container by deploy/smoke.sh (or against any fresh server with
// SMOKE_URL set). Sets the workspace up with a throwaway wallet, signs in, and checks the
// pages and endpoints a launch depends on. Uses only what the image already has: Node and the
// app's own @noble packages. Exits non-zero if any check fails.
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes, concatBytes } from '@noble/hashes/utils';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:3000';
const setupToken = process.env.SMOKE_SETUP_TOKEN || '';
const WORKSPACE = 'Smoke test workspace';
let cookie = '';
const lines = [];

const key = secp256k1.utils.randomPrivateKey();
const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
function sign(message) {
  const body = utf8ToBytes(message);
  const digest = keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body));
  const sig = secp256k1.sign(digest, key);
  return `0x${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-nonos'] = '1';
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return res;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    lines.push(`ok    ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    lines.push(`FAIL  ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

await check('/healthz answers', async () => {
  const res = await request('/healthz');
  expect(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  expect(body.ok === true, 'ok is not true');
  return body.version ? `version ${body.version}` : '';
});

await check('sign-in page loads with its security headers', async () => {
  const res = await request('/');
  expect(res.status === 200, `status ${res.status}`);
  expect((await res.text()).includes('<div id="root">'), 'no app shell in the page');
  expect(/default-src 'self'/.test(res.headers.get('content-security-policy') ?? ''), 'no Content-Security-Policy');
  expect(res.headers.get('x-frame-options') === 'DENY', 'no X-Frame-Options');
});

await check('a fresh workspace waits for its setup', async () => {
  const state = await (await request('/api/auth/state')).json();
  expect(state.needsSetup === true, 'it is already set up');
});

await check('setup with a wallet signature and the setup token', async () => {
  const res = await request('/api/auth/wallet/challenge', { method: 'POST', body: { mode: 'setup', address, chainId: 1, name: 'Smoke test', workspaceName: WORKSPACE, setupToken } });
  const challenge = await res.json();
  expect(res.status === 200, `challenge: ${res.status} ${challenge.error ?? ''}`);
  const verify = await request('/api/auth/wallet/verify', { method: 'POST', body: { challengeId: challenge.challengeId, signature: sign(challenge.message) } });
  expect(verify.status === 200, `verify: ${verify.status} ${(await verify.json()).error ?? ''}`);
  expect(cookie, 'no session cookie came back');
});

await check('the signed-in app loads its data', async () => {
  const res = await request('/api/bootstrap');
  expect(res.status === 200, `status ${res.status}`);
  const data = await res.json();
  expect(data.me && data.workspace?.name === WORKSPACE, 'the workspace or the signed-in person is missing');
});

await check('public proof verifier', async () => {
  const page = await request('/verify');
  expect(page.status === 200 && (await page.text()).includes('<div id="root">'), 'the verifier page did not load');
  const key = await (await request('/api/proofs/key')).json();
  expect(key.configured === true && key.algorithm === 'Ed25519', 'no proof signing key');
  const wellKnown = await request('/.well-known/nonos-proof-key');
  expect(wellKnown.status === 200, `well-known key: ${wellKnown.status}`);
  return `key ${key.fingerprint}`;
});

await check('encrypted capsule export', async () => {
  const res = await request('/api/export/capsule', { method: 'POST', body: { passphrase: 'smoke-test passphrase, thrown away' } });
  expect(res.status === 200, `status ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  expect(bytes.subarray(0, 8).toString() === 'NONOSCAP', 'the download is not a capsule');
  expect(!bytes.includes(Buffer.from(WORKSPACE)), 'the capsule contains plain text from the workspace');
  return `${bytes.length} bytes`;
});

console.log(lines.join('\n'));
