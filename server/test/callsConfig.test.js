import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CONFIG = new URL('../config.js', import.meta.url).href;
const HEADERS = new URL('../security/securityHeaders.js', import.meta.url).href;
const REQUIRED = { APP_URL: 'https://nil.example.com', NOX_RPC_URL: 'http://127.0.0.1:8545' };
const SECRET = 'a'.repeat(64);

// Call settings are read once, at start-up, so each case starts its own process.
function load(env) {
  const script = `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(config.calls));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...REQUIRED, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { calls: JSON.parse(run.stdout), warnings: run.stderr.split('\n').filter((l) => l.includes('[config]')).join('\n') };
}

function permissions(env) {
  const script = `const { default: headers } = await import(${JSON.stringify(HEADERS)}); const out = {}; headers({ secure: true }, { setHeader: (k, v) => (out[k] = v) }, () => {}); console.log(out['Permissions-Policy']);`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }).stdout.trim();
}

test('calls need a relay and a long enough secret, and have sensible defaults', () => {
  const plain = load({});
  assert.equal(plain.calls.enabled, true);
  assert.equal(plain.calls.turn.configured, false);
  assert.deepEqual([plain.calls.maxPeers, plain.calls.turnTtlSeconds, plain.calls.ringSeconds], [6, 600, 45]);
  const set = load({ TURN_URLS: 'turns:turn.example.com:5349?transport=tcp, turn:turn.example.com:3478?transport=udp', TURN_SECRET: SECRET });
  assert.equal(set.calls.turn.configured, true);
  assert.deepEqual(set.calls.turn.urls, ['turns:turn.example.com:5349?transport=tcp', 'turn:turn.example.com:3478?transport=udp']);
  assert.equal(set.warnings, '');
  const short = load({ TURN_URLS: 'turn:turn.example.com', TURN_SECRET: 'short' });
  assert.equal(short.calls.turn.configured, false);
  assert.match(short.warnings, /TURN_SECRET is shorter than 32 characters/);
  // nothing but turn:, turns: and stun: addresses, and nothing that could carry a path or a script
  const odd = load({ TURN_URLS: 'https://evil.example.com,turn:ok.example.com,turn:x.example.com/../a', TURN_SECRET: SECRET });
  assert.deepEqual(odd.calls.turn.urls, ['turn:ok.example.com']);
  assert.match(odd.warnings, /TURN_URLS has entries/);
  const capped = load({ CALL_MAX_PEERS: '50', TURN_TTL_SECONDS: '5' });
  assert.deepEqual([capped.calls.maxPeers, capped.calls.turnTtlSeconds], [6, 600]);
});

test('calls are off with CALLS=off and always on an onion address, and so are camera and microphone', () => {
  assert.equal(load({ CALLS: 'off' }).calls.enabled, false);
  const onion = load({ APP_URL: 'http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv.onion', CALLS: 'on' }).calls;
  assert.deepEqual([onion.enabled, onion.onion], [false, true]);
  assert.match(permissions(REQUIRED), /camera=\(self\), microphone=\(self\), display-capture=\(self\)/);
  assert.match(permissions({ ...REQUIRED, CALLS: 'off' }), /camera=\(\), microphone=\(\), display-capture=\(\)/);
});
