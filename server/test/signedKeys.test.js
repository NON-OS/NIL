import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import sealed from './helpers/sealed.js';
import keyStatement from '../keys/keyStatement.js';
import siwe from '../auth/siwe.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const STEALTH_META = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)))[0].meta;

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const wallets = { owner: wallet(), ana: wallet(), anaSpare: wallet(), outsider: wallet() };
const ids = {};

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wallets.ana, 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const directory = async (as = owner) => (await as('GET', '/api/encryption-keys')).data;

test('bootstrap names the site and the workspace key that key messages are bound to', async () => {
  const boot = (await ana('GET', '/api/bootstrap')).data;
  assert.equal(boot.origin, srv.base);
  assert.equal(boot.workspaceKey, (await ana('GET', '/api/proofs/key')).data.key);
});

test('a session cookie alone can’t publish a key: it takes a fresh signature from a linked wallet', async () => {
  // what the audit's proof of concept did: a bare key, no signature
  assert.equal((await ana('PUT', '/api/me/encryption-key', { publicKey: blob(32), reset: true })).status, 400);
  // signed by a wallet that isn't linked to Ana
  assert.equal((await publishKey(ana, wallets.outsider)).status, 403);
  // the right wallet, but the statement names someone else's account, another site or another workspace
  assert.equal((await publishKey(ana, wallets.ana, { userId: ids.owner })).status, 400);
  assert.equal((await publishKey(ana, wallets.ana, { origin: 'https://phish.example' })).status, 400);
  assert.equal((await publishKey(ana, wallets.ana, { workspaceKey: blob(32) })).status, 400);
  // a signature over different keys than the ones sent
  assert.equal((await publishKey(ana, wallets.ana, { sign: () => wallets.ana.sign('something else') })).status, 400);
  // a statement signed long ago
  assert.equal((await publishKey(ana, wallets.ana, { createdAt: Date.now() - 11 * 60_000 })).status, 400);
  // a first key must come with a wrap, or no wallet could open it again
  assert.equal((await publishKey(ana, wallets.ana, { wrap: false })).status, 400);
  assert.deepEqual(await directory(), []);

  const ok = await publishKey(ana, wallets.ana);
  assert.equal(ok.status, 200);
  ids.anaKeys = ok.sent;
  const [entry] = await directory();
  assert.equal(entry.userId, ids.ana);
  assert.equal(entry.active, true);
  // any member can rebuild the statement from the listing and recover the signer, as browsers do
  const url = new URL(srv.base);
  const { workspaceKey } = (await owner('GET', '/api/bootstrap')).data;
  const message = keyStatement({ host: url.host, origin: url.origin, address: entry.address, workspaceKey, userId: entry.userId, publicKey: entry.publicKey, signingKey: entry.signingKey, createdAt: entry.createdAt });
  assert.equal(siwe.recover(message, entry.signature), wallets.ana.address);
});

test('identity wraps belong to their owner and to linked wallets only', async () => {
  const wraps = (await ana('GET', '/api/me/identity-wraps')).data.wraps;
  assert.deepEqual(wraps.map((w) => w.address), [wallets.ana.address]);
  assert.equal(wraps[0].wrapped, ids.anaKeys.wrap.wrapped);
  assert.deepEqual((await owner('GET', '/api/me/identity-wraps')).data.wraps, []);
  const wrap = { address: wallets.anaSpare.address, nonce: 'abcdef0123456789', issuedAt: new Date().toISOString(), wrapped: blob(60) };
  assert.equal((await ana('PUT', '/api/me/identity-wraps', wrap)).status, 403);
  assert.equal((await owner('PUT', '/api/me/identity-wraps', { ...wrap, address: wallets.owner.address })).status, 409);
  assert.equal((await ana.wallet(wallets.anaSpare, 'add')).status, 200);
  assert.equal((await ana('PUT', '/api/me/identity-wraps', { ...wrap, wrapped: 'too-short' })).status, 400);
  assert.equal((await ana('PUT', '/api/me/identity-wraps', { ...wrap, issuedAt: 'yesterday' })).status, 400);
  assert.equal((await ana('PUT', '/api/me/identity-wraps', wrap)).status, 200);
  assert.equal((await ana('GET', '/api/me/identity-wraps')).data.wraps.length, 2);
});

test('the same keys can be signed again by another wallet; a stale statement can’t roll them back', async () => {
  const again = { publicKey: ids.anaKeys.publicKey, signingKey: ids.anaKeys.signingKey, wrap: false };
  const replay = await ana('PUT', '/api/me/encryption-key', ids.anaKeys);
  assert.equal(replay.status, 409);
  const spare = await publishKey(ana, wallets.anaSpare, { ...again, createdAt: Date.now() + 1000 });
  assert.equal(spare.status, 200);
  const [entry] = (await directory()).filter((k) => k.userId === ids.ana);
  assert.equal(entry.address, wallets.anaSpare.address);
  assert.equal((await ana('GET', '/api/me/identity-wraps')).data.wraps.length, 2);
  // removing the wallet that signed takes the key out of the directory, and its wrap with it
  const creds = (await ana('GET', '/api/me/credentials')).data.credentials;
  assert.equal((await ana('DELETE', `/api/me/credentials/${creds.find((c) => c.address === wallets.anaSpare.address).id}`)).status, 200);
  assert.deepEqual((await directory()).filter((k) => k.userId === ids.ana), []);
  assert.deepEqual((await ana('GET', '/api/me/identity-wraps')).data.wraps.map((w) => w.address), [wallets.ana.address]);
  assert.equal((await publishKey(ana, wallets.ana, { ...again, createdAt: Date.now() + 2000 })).status, 200);
  assert.equal((await directory()).filter((k) => k.userId === ids.ana).length, 1);
});

test('a reset takes a fresh signature and drops what was sealed to the old key', async () => {
  await publishKey(owner, wallets.owner);
  // private payouts on, at payout keys that come from the keys about to be replaced
  assert.equal((await ana('PUT', '/api/me/stealth', { metaAddress: STEALTH_META })).status, 200);
  const docId = blob(16);
  await owner('POST', '/api/docs', { id: docId, titleCt: blob(40), bodyCt: blob(100), audience: 'people', grants: [{ userId: ids.owner, wrappedKey: blob(92) }, { userId: ids.ana, wrappedKey: blob(92) }] });
  const task = (await owner('POST', '/api/tasks', { private: true, assigneeId: ids.ana, sealed: sealed(ids.owner, ids.ana) })).data.task;
  assert.equal(Object.keys(task.sealed.keys).length, 2);

  assert.equal((await publishKey(ana, wallets.ana)).status, 409);
  assert.equal((await ana('PUT', '/api/me/encryption-key', { publicKey: blob(32), signingKey: blob(32), createdAt: Date.now(), address: wallets.ana.address, reset: true })).status, 400);
  const reset = await publishKey(ana, wallets.ana, { reset: true, createdAt: Date.now() + 3000 });
  assert.equal(reset.status, 200);
  assert.equal((await ana('GET', `/api/docs/${docId}`)).status, 404);
  assert.deepEqual((await ana('GET', '/api/me/identity-wraps')).data.wraps.map((w) => w.wrapped), [reset.sent.wrap.wrapped]);
  const after = (await owner('GET', '/api/bootstrap')).data.tasks.find((t) => t.id === task.id);
  assert.deepEqual(Object.keys(after.sealed.keys), [ids.owner]);
  // and private payouts are off, so nobody pays to keys Ana no longer has
  assert.equal((await ana('GET', '/api/bootstrap')).data.me.stealthMeta, null);
  assert.equal((await owner('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.ana).stealthMeta, null);
});

test('deactivated people stay checkable as authors but are marked inactive', async () => {
  assert.equal((await owner('PATCH', `/api/users/${ids.ana}`, { deactivated: true })).status, 200);
  const entry = (await directory()).find((k) => k.userId === ids.ana);
  assert.equal(entry.active, false);
});
