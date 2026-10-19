import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import bootProcess from './helpers/bootProcess.js';
import contentSecurityPolicy from '../security/contentSecurityPolicy.js';
import cspProblems from '../../scripts/release/cspProblems.mjs';

// Phone wallets over WalletConnect: off unless WALLETCONNECT_PROJECT_ID is set, and then the
// relay is the one host the page may reach besides the server.
const SETTING = new URL('../config/walletConnect.js', import.meta.url).href;
// a made-up ID in the right shape; a real one is public but stays out of the repository
const PROJECT = 'a'.repeat(32);
const RELAY = 'wss://relay.walletconnect.org';

function load(env) {
  const script = `const { default: wc } = await import(${JSON.stringify(SETTING)}); console.log(JSON.stringify(wc));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { setting: JSON.parse(run.stdout), warnings: run.stderr.split('\n').filter((l) => l.includes('[config]')) };
}

test('phone wallets are off by default, and on with a project ID', () => {
  assert.deepEqual(load({}), { setting: { enabled: false, projectId: null, relayUrl: RELAY }, warnings: [] });
  assert.deepEqual(load({ WALLETCONNECT_PROJECT_ID: ' ' }).setting.enabled, false);
  assert.deepEqual(load({ WALLETCONNECT_PROJECT_ID: PROJECT }), { setting: { enabled: true, projectId: PROJECT, relayUrl: RELAY }, warnings: [] });
});

test('a project ID or relay that can’t be used is named at startup and falls back', () => {
  const bad = load({ WALLETCONNECT_PROJECT_ID: 'not-a-project-id' });
  assert.equal(bad.setting.enabled, false);
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /WALLETCONNECT_PROJECT_ID .*Phone wallets stay off/);
  for (const relay of ['https://relay.walletconnect.org', 'ws://relay.example', 'wss://relay.example/path', 'wss://user:pw@relay.example', 'nonsense']) {
    const run = load({ WALLETCONNECT_PROJECT_ID: PROJECT, WALLETCONNECT_RELAY_URL: relay });
    assert.equal(run.setting.relayUrl, RELAY, relay);
    assert.match(run.warnings.join('\n'), /WALLETCONNECT_RELAY_URL must be a wss:\/\/ address/, relay);
  }
  // a relay of one's own over wss, or plain ws on this machine for tests
  assert.equal(load({ WALLETCONNECT_RELAY_URL: 'wss://relay.example.org/' }).setting.relayUrl, 'wss://relay.example.org');
  assert.equal(load({ WALLETCONNECT_RELAY_URL: 'ws://127.0.0.1:4567' }).setting.relayUrl, 'ws://127.0.0.1:4567');
});

test('the policy lets the page reach the relay only when phone wallets are on', () => {
  const off = contentSecurityPolicy({ secure: true });
  // exactly the policy Nil sent before phone wallets existed
  assert.equal(off, "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests");
  const on = contentSecurityPolicy({ secure: true, relay: RELAY });
  assert.equal(on, off.replace("connect-src 'self'", `connect-src 'self' ${RELAY}`));
  assert.ok(!contentSecurityPolicy({ secure: false, relay: RELAY }).includes('upgrade-insecure-requests'));
  // frames stay refused, so WalletConnect's verify frame can't load either way
  assert.match(on, /frame-src 'none'/);
  assert.deepEqual(cspProblems(on), []);
  assert.deepEqual(cspProblems(off), []);
});

async function serve(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-wc-'));
  const srv = await bootProcess({ dataDir, env });
  assert.ok(srv.base, srv.stderr());
  try {
    const health = await fetch(`${srv.base}/healthz`);
    const state = await (await fetch(`${srv.base}/api/auth/state`)).json();
    return { csp: health.headers.get('content-security-policy'), state };
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test('a server without a project ID tells browsers nothing about WalletConnect and allows no relay', async () => {
  const { csp, state } = await serve({ WALLETCONNECT_PROJECT_ID: '' });
  assert.match(csp, /connect-src 'self'; /);
  assert.ok(!csp.includes('walletconnect'));
  assert.equal(state.walletConnect, null);
});

test('with a project ID, the start-up answer carries it, the relay and the network, and the policy allows that relay', async () => {
  const { csp, state } = await serve({ WALLETCONNECT_PROJECT_ID: PROJECT });
  assert.match(csp, new RegExp(`connect-src 'self' ${RELAY}; `));
  assert.deepEqual(state.walletConnect, { projectId: PROJECT, relayUrl: RELAY, chainId: 1 });
});
