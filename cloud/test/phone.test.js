import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadConfig from '../config/loadConfig.js';
import createSignupFlow from '../signup/createSignupFlow.js';
import createPublicServer from '../signup/http/createPublicServer.js';
import baseEnv from './helpers/baseEnv.js';
import testContext from './helpers/testContext.js';

const PROJECT = 'f'.repeat(32);
// the policy the sign-up site has always sent, which phone wallets off must leave alone
const STRICT = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const read = (env) => loadConfig({ ...baseEnv, CLOUD_DATA_DIR: '/tmp/nil-cloud-phone-test', ...env });

async function site(env) {
  const ctx = testContext({ env });
  const server = createPublicServer(ctx, createSignupFlow(ctx, { provision: async () => {} }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/`);
  const script = await fetch(`${base}/assets/phone.js`);
  const result = { csp: page.headers.get('content-security-policy'), html: await page.text(), script: { status: script.status, type: script.headers.get('content-type'), body: await script.text() } };
  await new Promise((resolve) => server.close(resolve));
  return result;
}

test('phone wallet settings: off unless set, and a wrong value stops the start', () => {
  assert.equal(read({}).config.walletConnect, null);
  assert.deepEqual({ ...read({ WALLETCONNECT_PROJECT_ID: PROJECT }).config.walletConnect }, { projectId: PROJECT, relayUrl: 'wss://relay.walletconnect.org' });
  assert.equal(read({ WALLETCONNECT_PROJECT_ID: PROJECT, WALLETCONNECT_RELAY_URL: 'wss://relay.example/' }).config.walletConnect.relayUrl, 'wss://relay.example');
  assert.equal(read({ WALLETCONNECT_PROJECT_ID: PROJECT, WALLETCONNECT_RELAY_URL: 'ws://127.0.0.1:9000' }).config.walletConnect.relayUrl, 'ws://127.0.0.1:9000');

  for (const id of ['F'.repeat(32), 'f'.repeat(31), 'your-project-id']) {
    const { config, errors } = read({ WALLETCONNECT_PROJECT_ID: id });
    assert.equal(config.walletConnect, null);
    assert.equal(errors.length, 1, id);
    assert.match(errors[0], /^WALLETCONNECT_PROJECT_ID isn’t a WalletConnect project ID/);
    assert.doesNotMatch(errors[0], /\n/);
  }
  for (const relay of ['ws://relay.example', 'https://relay.example', 'wss://relay.example/v1', 'wss://user:pw@relay.example', 'wss://relay.example/?x=1']) {
    const { errors } = read({ WALLETCONNECT_PROJECT_ID: PROJECT, WALLETCONNECT_RELAY_URL: relay });
    assert.deepEqual(errors, ['WALLETCONNECT_RELAY_URL must be a wss:// address with no path, or empty for WalletConnect’s own relay.'], relay);
  }
  const lone = read({ WALLETCONNECT_RELAY_URL: 'wss://relay.example' });
  assert.equal(lone.config.walletConnect, null);
  assert.ok(lone.warnings.some((w) => /WALLETCONNECT_PROJECT_ID isn’t/.test(w)));
});

test('with phone wallets off, the sign-up site is what it always was', async () => {
  const off = await site({});
  assert.equal(off.csp, STRICT);
  assert.equal(off.script.status, 404);
  assert.doesNotMatch(off.html, /phone|walletconnect|\{\{/i);
});

test('with phone wallets on, the page offers them and the policy adds the relay and nothing else', async () => {
  const on = await site({ WALLETCONNECT_PROJECT_ID: PROJECT });
  assert.equal(on.csp, STRICT.replace("connect-src 'self'", "connect-src 'self' wss://relay.walletconnect.org"));
  assert.match(on.html, new RegExp(`<main id="app" data-domain="nil\\.test" data-pow="4" data-phone-project="${PROJECT}" data-phone-relay="wss://relay\\.walletconnect\\.org">`));
  assert.match(on.html, /<button type="button" id="phone" class="secondary" hidden>Use a wallet on your phone<\/button>/);
  assert.match(on.html, /<dialog id="phone-dialog" class="dialog" aria-labelledby="phone-title">/);
  assert.match(on.html, /<p id="phone-status" class="phone-status" role="status">/);
  assert.match(on.html, /talks to WalletConnect’s relay/);
  assert.doesNotMatch(on.html, /\{\{|<script(?![^>]*src="\/assets\/signup\.js")|style=/);
  assert.equal(on.script.status, 200);
  assert.equal(on.script.type, 'text/javascript; charset=utf-8');
  assert.match(on.script.body, /relay\.walletconnect\.org/);

  const custom = await site({ WALLETCONNECT_PROJECT_ID: PROJECT, WALLETCONNECT_RELAY_URL: 'wss://relay.example' });
  assert.match(custom.csp, /connect-src 'self' wss:\/\/relay\.example;/);
  assert.doesNotMatch(custom.csp, /walletconnect/);
});

test('a closed sign-up page keeps the phone button disabled too', async () => {
  const ctx = testContext({ env: { WALLETCONNECT_PROJECT_ID: PROJECT, CLOUD_SIGNUP: 'closed' } });
  const server = createPublicServer(ctx, createSignupFlow(ctx, { provision: async () => {} }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const html = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
  await new Promise((resolve) => server.close(resolve));
  assert.match(html, /id="phone" class="secondary" hidden disabled>/);
});
