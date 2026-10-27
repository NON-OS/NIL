import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import socket from './helpers/socket.js';
import revisionsToDrop from '../services/revisionsToDrop.js';

// Live editing, as the server sees it: numbered ciphertext it passes on and folds away.
const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const wrapped = () => blob(92);

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};
const wallets = { owner: wallet(), ana: wallet(), ben: wallet() };

before(async () => {
  srv = await startServer({ env: { DOC_PENDING_UPDATES: '50', DOC_UPDATE_MAX_KB: '16' } });
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
  for (const [c, w] of [[owner, wallets.owner], [ana, wallets.ana], [ben, wallets.ben]]) await publishKey(c, w);
  ids.doc = blob(16);
  const grants = [ids.owner, ids.ana].map((userId) => ({ userId, wrappedKey: wrapped() }));
  await owner('POST', '/api/docs', { id: ids.doc, titleCt: blob(40), bodyCt: blob(200), audience: 'people', grants });
});
after(() => srv.close());

test('changes are numbered per doc, passed on to key holders, and hidden from everyone else', async () => {
  const anaLive = await socket(base(), ana.cookie());
  const benLive = await socket(base(), ben.cookie());
  const sent = await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(120) });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.seq, 1);
  assert.equal((await ana('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(120) })).data.seq, 2);
  await sleep(150);
  const seen = anaLive.events.filter((e) => e.type === 'doc-update');
  assert.deepEqual(seen.map((e) => e.seq), [1, 2]);
  assert.equal(seen[0].by, ids.owner);
  assert.equal(benLive.events.some((e) => e.type === 'doc-update'), false);
  anaLive.close();
  benLive.close();

  assert.equal((await ben('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(120) })).status, 404);
  assert.equal((await ben('GET', `/api/docs/${ids.doc}/updates`)).status, 404);
  assert.equal((await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: 'not base64!' })).status, 400);
  assert.equal((await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(13_000) })).status, 400);

  const opened = (await ana('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.equal(opened.updatesThrough, 0);
  assert.deepEqual(opened.updates.map((u) => u.seq), [1, 2]);
});

test('a saved version folds in the changes it covers, and the count carries on', async () => {
  const doc = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.equal((await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), through: 9 })).status, 400);
  const saved = await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), through: 1 });
  assert.equal(saved.data.doc.updatesThrough, 1);
  const opened = (await ana('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.deepEqual(opened.updates.map((u) => u.seq), [2]);
  // a tab that fell behind the newest version reopens the doc instead of replaying
  assert.equal((await ana('GET', `/api/docs/${ids.doc}/updates?after=0`)).status, 409);
  assert.deepEqual((await ana('GET', `/api/docs/${ids.doc}/updates?after=1`)).data.updates.map((u) => u.seq), [2]);
  // numbers never restart, even once every change has been folded away
  const next = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: next.version, titleCt: blob(40), bodyCt: blob(300), through: 2 });
  assert.equal((await ana('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(80) })).data.seq, 3);
});

test('a doc stops taking changes until a version folds them in', async () => {
  let status = 200;
  for (let i = 0; i < 60 && status === 200; i++) status = (await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(60) })).status;
  assert.equal(status, 409);
  const doc = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  const last = doc.updates.at(-1).seq;
  await owner('PUT', `/api/docs/${ids.doc}`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), through: last });
  assert.equal((await owner('POST', `/api/docs/${ids.doc}/updates`, { updateCt: blob(60) })).status, 200);
});

test('re-keying a doc drops every change sealed under the old key', async () => {
  const doc = (await owner('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.ok(doc.updates.length > 0);
  const grants = [ids.owner, ids.ana].map((userId) => ({ userId, wrappedKey: wrapped() }));
  await owner('POST', `/api/docs/${ids.doc}/rotate`, { baseVersion: doc.version, titleCt: blob(40), bodyCt: blob(300), grants });
  const fresh = (await ana('GET', `/api/docs/${ids.doc}`)).data.doc;
  assert.deepEqual(fresh.updates, []);
  assert.equal(fresh.updatesThrough, doc.updates.at(-1).seq);
});

test('cursors pass only between tabs that hold the key and have the doc open', async () => {
  const mine = await socket(base(), owner.cookie());
  const anas = await socket(base(), ana.cookie());
  const bens = await socket(base(), ben.cookie());
  for (const s of [mine, anas, bens]) s.send({ type: 'doc-open', docId: ids.doc });
  await sleep(100);
  mine.send({ type: 'doc-aware', docId: ids.doc, ct: blob(60) });
  bens.send({ type: 'doc-aware', docId: ids.doc, ct: blob(60) });
  mine.send({ type: 'doc-aware', docId: ids.doc, ct: blob(4000) });
  await sleep(150);
  assert.equal(anas.events.filter((e) => e.type === 'doc-aware').length, 1);
  assert.equal(bens.events.some((e) => e.type === 'doc-aware'), false);
  assert.equal(mine.events.some((e) => e.type === 'doc-aware'), false);
  for (const s of [mine, anas, bens]) s.close();
});

test('mentioning someone tells only people holding the doc’s key, once in a while', async () => {
  const doc = blob(16);
  const grants = [ids.owner, ids.ana].map((userId) => ({ userId, wrappedKey: wrapped() }));
  await owner('POST', '/api/docs', { id: doc, titleCt: blob(40), bodyCt: blob(200), audience: 'people', grants });
  const sent = await owner('POST', `/api/docs/${doc}/mentions`, { userIds: [ids.ana, ids.ben, ids.owner] });
  assert.equal(sent.data.told, 1);
  assert.equal((await owner('POST', `/api/docs/${doc}/mentions`, { userIds: [ids.ana] })).data.told, 0);
  const notices = (await ana('GET', '/api/notifications')).data;
  const list = Array.isArray(notices) ? notices : notices.notifications ?? notices.items;
  const mine = list.filter((n) => n.type === 'doc_mention');
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].data, { docId: doc });
  assert.equal((await ben('POST', `/api/docs/${doc}/mentions`, { userIds: [ids.ana] })).status, 404);
  assert.equal((await owner('POST', `/api/docs/${doc}/mentions`, { userIds: 'ana' })).status, 400);
});

test('history keeps recent versions close together and older ones spread out', () => {
  const now = 100 * 24 * 3_600_000;
  const row = (version, agoMs) => ({ version, created_at: now - agoMs });
  const rows = [row(9, 1000), row(8, 20_000), row(7, 90_000), row(6, 100_000), row(5, 2 * 3_600_000), row(4, 2 * 3_600_000 + 60_000), row(3, 3 * 86_400_000), row(2, 3 * 86_400_000 + 3_600_000), row(1, 9 * 86_400_000)];
  assert.deepEqual(revisionsToDrop(rows, now, 100), [8, 6, 4, 2]);
  assert.deepEqual(revisionsToDrop(rows, now, 2), [8, 6, 5, 4, 3, 2, 1]);
});
