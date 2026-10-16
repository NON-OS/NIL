import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// The server never sees plaintext, so these tests speak its language: random base64url
// blobs of the right sizes standing in for keys and ciphertext.
const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const publicKey = () => blob(32);
const wrapped = () => blob(92);
const docId = () => blob(16);

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallet(), 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

test('publishing an encryption key is validated and can’t be swapped silently', async () => {
  assert.equal((await owner('PUT', '/api/me/encryption-key', { publicKey: 'short' })).status, 400);
  ids.ownerKey = publicKey();
  assert.equal((await owner('PUT', '/api/me/encryption-key', { publicKey: ids.ownerKey })).status, 200);
  assert.equal((await owner('PUT', '/api/me/encryption-key', { publicKey: ids.ownerKey })).status, 200);
  assert.equal((await owner('PUT', '/api/me/encryption-key', { publicKey: publicKey() })).status, 409);
  await ana('PUT', '/api/me/encryption-key', { publicKey: publicKey() });
  const directory = (await ben('GET', '/api/encryption-keys')).data;
  assert.deepEqual(directory.map((k) => k.userId).sort(), [ids.ana, ids.owner].sort());
});

test('a doc is readable only with a sealed key; others don’t learn it exists', async () => {
  const id = docId();
  assert.equal((await owner('POST', '/api/docs', { id, titleCt: blob(40), bodyCt: blob(200), grants: [{ userId: ids.ana, wrappedKey: wrapped() }] })).status, 400);
  assert.equal((await owner('POST', '/api/docs', { id, titleCt: blob(40), bodyCt: blob(200), grants: [{ userId: ids.owner, wrappedKey: wrapped() }, { userId: ids.ben, wrappedKey: wrapped() }] })).status, 400);
  const created = await owner('POST', '/api/docs', { id, titleCt: blob(40), bodyCt: blob(200), audience: 'people', grants: [{ userId: ids.owner, wrappedKey: wrapped() }] });
  assert.equal(created.status, 200);
  assert.equal(created.data.doc.version, 1);
  ids.doc = id;

  for (const outsider of [ana, ben]) {
    assert.equal((await outsider('GET', `/api/docs/${id}`)).status, 404);
    assert.equal((await outsider('PUT', `/api/docs/${id}`, { baseVersion: 1, titleCt: blob(40), bodyCt: blob(200) })).status, 404);
    const list = (await outsider('GET', '/api/docs')).data;
    assert.equal(list.docs.length + list.waiting.length, 0);
  }
  assert.equal((await ana('POST', `/api/docs/${id}/grants`, { grants: [{ userId: ids.ana, wrappedKey: wrapped() }] })).status, 404);

  await owner('POST', `/api/docs/${id}/grants`, { grants: [{ userId: ids.ana, wrappedKey: wrapped() }] });
  assert.equal((await ana('GET', `/api/docs/${id}`)).status, 200);
});

test('team docs show up as waiting for people who don’t hold the key yet', async () => {
  const id = docId();
  await owner('POST', '/api/docs', { id, titleCt: blob(40), bodyCt: blob(100), audience: 'team', grants: [{ userId: ids.owner, wrappedKey: wrapped() }] });
  const benSees = (await ben('GET', '/api/docs')).data;
  assert.deepEqual(benSees.waiting.map((w) => w.id), [id]);
  assert.equal('titleCt' in benSees.waiting[0], false);
  // Ben can't receive a key until he publishes his own
  assert.equal((await owner('POST', `/api/docs/${id}/grants`, { grants: [{ userId: ids.ben, wrappedKey: wrapped() }] })).status, 400);
  await ben('PUT', '/api/me/encryption-key', { publicKey: publicKey() });
  assert.equal((await ana('POST', `/api/docs/${id}/grants`, { grants: [{ userId: ids.ben, wrappedKey: wrapped() }] })).status, 404);
  assert.equal((await owner('POST', `/api/docs/${id}/grants`, { grants: [{ userId: ids.ben, wrappedKey: wrapped() }] })).status, 200);
  assert.equal((await ben('GET', '/api/docs')).data.docs.length, 1);
});

test('saves are versioned: stale writes are refused and history is kept', async () => {
  const first = await ana('PUT', `/api/docs/${ids.doc}`, { baseVersion: 1, titleCt: blob(40), bodyCt: blob(300) });
  assert.equal(first.data.doc.version, 2);
  assert.equal((await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: 1, titleCt: blob(40), bodyCt: blob(300) })).status, 409);
  await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: 2, titleCt: blob(40), bodyCt: blob(300) });
  const revisions = (await ana('GET', `/api/docs/${ids.doc}/revisions`)).data;
  assert.deepEqual(revisions.map((r) => r.version), [2, 1]);
  assert.equal((await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: 3, titleCt: 'not base64!', bodyCt: blob(300) })).status, 400);
});

test('removing a reader re-keys the doc and drops old revisions; only managers can', async () => {
  const doc = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.equal((await ana('POST', `/api/docs/${ids.doc}/rotate`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), grants: [{ userId: ids.ana, wrappedKey: wrapped() }] })).status, 403);
  const rotated = await owner('POST', `/api/docs/${ids.doc}/rotate`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), grants: [{ userId: ids.owner, wrappedKey: wrapped() }] });
  assert.deepEqual(rotated.data.readers, [ids.owner]);
  assert.equal((await ana('GET', `/api/docs/${ids.doc}`)).status, 404);
  assert.equal((await owner('GET', `/api/docs/${ids.doc}/revisions`)).data.length, 0);
});

test('resetting your key gives up every doc sealed to the old one', async () => {
  const fresh = docId();
  await owner('POST', '/api/docs', { id: fresh, titleCt: blob(40), bodyCt: blob(100), audience: 'people', grants: [{ userId: ids.owner, wrappedKey: wrapped() }, { userId: ids.ana, wrappedKey: wrapped() }] });
  assert.equal((await ana('PUT', '/api/me/encryption-key', { publicKey: publicKey(), reset: true })).status, 200);
  assert.equal((await ana('GET', `/api/docs/${fresh}`)).status, 404);
  assert.equal((await ana('DELETE', `/api/docs/${fresh}`)).status, 404);
  assert.equal((await owner('DELETE', `/api/docs/${fresh}`)).status, 200);
  assert.equal((await owner('GET', `/api/docs/${fresh}`)).status, 404);
});
