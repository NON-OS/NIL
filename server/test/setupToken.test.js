import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import bootProcess from './helpers/bootProcess.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import SETUP_TOKEN from './helpers/setupToken.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const stranger = client(base);
const ownerWallet = wallet();

const restoreHeaders = (token) => ({
  'Content-Type': 'application/octet-stream',
  'X-Capsule-Passphrase': Buffer.from('short').toString('base64'),
  ...(token === undefined ? {} : { 'X-Setup-Token': token }),
});
const junk = new Uint8Array(64);

before(async () => {
  srv = await startServer();
});
after(() => srv.close());

test('a fresh server can’t be claimed without the setup token', async () => {
  for (const setupToken of [undefined, '', 'not-the-token-at-all']) {
    const res = await stranger.wallet(wallet(), 'setup', { name: 'Mallory', setupToken });
    assert.equal(res.status, 403, String(setupToken));
    assert.match(res.data.error, /setup token/);
    assert.equal((await stranger('POST', '/api/auth/restore', junk, restoreHeaders(setupToken))).status, 403);
  }
  assert.equal((await stranger('GET', '/api/auth/state')).data.needsSetup, true);
  // the right token gets past the gate (and on to the passphrase check)
  assert.equal((await stranger('POST', '/api/auth/restore', junk, restoreHeaders(SETUP_TOKEN))).status, 400);
});

test('the right token claims it, and stops working once a workspace exists', async () => {
  const res = await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS', setupToken: ` ${SETUP_TOKEN} ` });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.role, 'owner');
  assert.equal((await stranger.wallet(wallet(), 'setup', { name: 'Mallory', setupToken: SETUP_TOKEN })).status, 409);
  assert.equal((await stranger('POST', '/api/auth/restore', junk, restoreHeaders(SETUP_TOKEN))).status, 409);
});

test('without SETUP_TOKEN the server makes one, prints it once and forgets it once claimed', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-setup-'));
  const file = path.join(dataDir, 'setup-token');
  try {
    const first = await bootProcess({ dataDir });
    const token = /one-time setup token: (\S+)/.exec(first.stdout())?.[1];
    assert.ok(token && token.length >= 32, first.stdout());
    assert.equal(fs.readFileSync(file, 'utf8').trim(), token);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(await first.stop(), 0);

    // a restart keeps the same token but doesn't print it again
    const second = await bootProcess({ dataDir });
    assert.ok(!second.stdout().includes(token));
    assert.match(second.stdout(), /setup token was printed when this server first started/);
    const there = client(() => second.base);
    assert.equal((await there.wallet(wallet(), 'setup', { name: 'Mallory', setupToken: 'guess-guess-guess-guess' })).status, 403);
    assert.equal((await there.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS', setupToken: token })).status, 200);
    assert.equal(fs.existsSync(file), false);
    assert.equal(await second.stop(), 0);

    const third = await bootProcess({ dataDir });
    assert.ok(!third.stdout().includes('[setup]'));
    assert.equal(await third.stop(), 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
