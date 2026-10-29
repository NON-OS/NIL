import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import cipher from './helpers/cipher.js';
import sealedBlob from './helpers/sealedBlob.js';
import sharedFolder from './helpers/sharedFolder.js';
import until from './helpers/until.js';

// Taking someone out of a folder or a doc, as the server sees it: every item and blob waits to be
// encrypted again by the browsers of the people who stay, each browser takes a few at a time, and
// a fresh copy takes the old one's place one for one, after which the old ciphertext is gone. The
// server checks the bookkeeping; it never sees a key.
let srv;
let sql;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base) };
const { owner, ana, ben, cy } = people;
const ids = {};
const MB = 1024 * 1024;

const chunkFiles = (id) => fs.readdirSync(path.join(srv.dataDir, 'uploads')).filter((n) => n.startsWith(`${id}_`));
const scopeOf = (folder) => ({ kind: 'folder', id: folder.id });
const row = (id) => sql.get('SELECT * FROM folder_items WHERE id = ?', id);
const blobRow = (id) => sql.get('SELECT * FROM sealed_blobs WHERE id = ?', id);
const fresh = (items) => items.map((i) => ({ id: i.id, keyWrap: cipher(60), metaCt: cipher(300) }));
const rotate = (c, folder, keep, items, extra = {}) =>
  c('POST', `/api/folders/${folder.id}/rotate`, { baseVersion: 1, audience: 'people', nameCt: cipher(120), grants: sharedFolder.grants(keep), items: fresh(items), ...extra });

// a file of `plain` bytes with a thumbnail, and a chunk list when it has more than one chunk
async function file(c, folder, plain, { thumb = true } = {}) {
  const blob = await sealedBlob.upload(c, scopeOf(folder), plain);
  const chunks = Math.max(1, Math.ceil(plain / MB));
  const parts = {};
  if (thumb) parts.thumbId = (await sealedBlob.upload(c, scopeOf(folder), 200, { part: 'thumb' })).id;
  if (chunks > 1) parts.hashesId = (await sealedBlob.upload(c, scopeOf(folder), 32 * chunks, { part: 'hashes' })).id;
  const res = await sharedFolder.add(c, folder, { blobId: blob.id, ...parts });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.item;
}

before(async () => {
  srv = await startServer({ env: { FILES_RESEAL_BATCH: '2', SEALED_OPEN_CHUNKS: '2', SEALED_UPLOAD_IDLE_MINUTES: '5', FILES_THUMB_MAX_KB: '16', SEALED_UPLOADS_PER_HOUR: '20' } });
  ({ default: sql } = await import('../db/sql.js'));
  const w = Object.fromEntries(Object.keys(people).map((k) => [k, wallet()]));
  ids.owner = (await owner.wallet(w.owner, 'setup', { name: 'Owner', workspaceName: 'Reseal' })).data.user.id;
  for (const who of ['ana', 'ben', 'cy']) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await people[who].wallet(w[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
  for (const who of Object.keys(people)) await publishKey(people[who], w[who]);
});
after(() => srv.close());

test('taking someone out leaves every item waiting, and each browser takes a few at a time', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.cy]);
  const items = [await file(ana, folder, 100), await file(ana, folder, 100, { thumb: false }), (await sharedFolder.add(cy, folder, { kind: 'folder' })).data.item];
  assert.equal((await rotate(ana, folder, [ids.ana, ids.ben, ids.cy], items)).status, 200, 'a new key that keeps everyone');
  assert.equal(sql.get('SELECT reseal_rev FROM folders WHERE id = ?', folder.id).reseal_rev, 0, 'nobody to keep out, nothing to encrypt again');
  const res = await rotate(ana, folder, [ids.ana, ids.ben], items, { baseVersion: 2 });
  assert.equal(res.status, 200);
  const listed = (await ben('GET', `/api/folders/${folder.id}`)).data;
  assert.equal(listed.folder.resealRev, 3);
  assert.ok(listed.items.every((i) => i.keyRev < listed.folder.resealRev));
  assert.equal((await ben('PATCH', `/api/folders/${folder.id}/items/${items[0].id}`, { parentId: null, keyRev: 3, metaCt: cipher(300) })).status, 403);
  assert.equal((await ana('PATCH', `/api/folders/${folder.id}/items/${items[0].id}`, { parentId: null, keyRev: 3, metaCt: cipher(300) })).status, 409, 'its key may be in Cy’s hands');

  assert.equal((await cy('POST', `/api/folders/${folder.id}/reseal/claim`)).status, 404, 'Cy is out');
  const bens = (await ben('POST', `/api/folders/${folder.id}/reseal/claim`)).data;
  const anas = (await ana('POST', `/api/folders/${folder.id}/reseal/claim`)).data;
  assert.deepEqual([bens.items.length, bens.left, anas.items.length], [2, 3, 1]);
  assert.equal(new Set([...bens.items, ...anas.items]).size, 3, 'no item handed to two browsers');
  assert.deepEqual((await ben('POST', `/api/folders/${folder.id}/reseal/claim`)).data.items.sort(), bens.items.sort(), 'asking again keeps your own');
});

test('a fresh copy stands in for one waiting blob of the same size, and swapping it in drops the old', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.cy]);
  const item = await file(ana, folder, MB + 10);
  const plain = await file(ana, folder, 50, { thumb: false });
  const scope = scopeOf(folder);
  // not waiting yet: no copy
  assert.equal((await sealedBlob.start(ben, scope, MB + 10, { replaces: item.blob.id })).status, 400);
  assert.equal((await rotate(ana, folder, [ids.ana, ids.ben], [item, plain])).status, 200);
  assert.equal((await sealedBlob.start(ben, scope, MB + 11, { replaces: item.blob.id })).status, 400, 'another size');
  assert.equal((await sealedBlob.start(ben, { kind: 'doc', id: folder.id }, MB + 10, { replaces: item.blob.id })).status, 404);
  const blob = (await sealedBlob.upload(ben, scope, MB + 10, { replaces: item.blob.id })).id;
  const thumb = (await sealedBlob.upload(ben, scope, 200, { replaces: item.thumb.id, part: 'thumb' })).id;
  const hashes = (await sealedBlob.upload(ben, scope, 64, { replaces: item.hashes.id, part: 'hashes' })).id;
  const stray = (await sealedBlob.upload(ana, scope, MB + 10, { replaces: item.blob.id })).id;
  const swap = (c, extra) => c('POST', `/api/folders/${folder.id}/items/${item.id}/reseal`, { keyRev: 2, keyWrap: cipher(60), metaCt: cipher(300), blobId: blob, thumbId: thumb, hashesId: hashes, ...extra });
  assert.equal((await swap(ben, { keyRev: 1 })).status, 409, 'wrapped under an old folder key');
  assert.equal((await swap(ben, { blobId: thumb })).status, 400, 'not a copy of the file');
  assert.equal((await swap(ana)).status, 400, 'someone else’s copies');
  assert.equal((await swap(cy)).status, 404);
  const done = await swap(ben);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.deepEqual([done.data.item.blob.id, done.data.item.thumb.id, done.data.item.hashes.id, done.data.item.keyRev], [blob, thumb, hashes, 2]);
  for (const old of [item.blob.id, item.thumb.id, item.hashes.id, stray]) {
    assert.equal(blobRow(old), undefined);
    assert.deepEqual(chunkFiles(old), []);
  }
  assert.equal(blobRow(blob).uploader_id, ids.ana, 'the copy counts against the original uploader');
  assert.equal(blobRow(blob).replaces, null);
  assert.equal((await swap(ben)).status, 409, 'done already');

  // a thumbnail nobody could check stays behind; a file without a chunk list may gain one
  const copy = (await sealedBlob.upload(ben, scope, 50, { replaces: plain.blob.id })).id;
  const list = (await sealedBlob.upload(ben, scope, 32, { part: 'hashes' })).id;
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${plain.id}/reseal`, { keyRev: 2, keyWrap: cipher(60), metaCt: cipher(300), blobId: copy, hashesId: list })).status, 400, 'a one-chunk file has no chunk list');
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${plain.id}/reseal`, { keyRev: 2, keyWrap: cipher(60), metaCt: cipher(300), blobId: copy })).status, 200);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/reseal/claim`)).data.left, 0);
});

test('a removal can’t be blocked by an item nobody can open: the manager drops it', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  const planted = (await sharedFolder.add(ben, folder, { kind: 'folder' })).data.item;
  const inside = await file(ben, folder, 40);
  await ben('PATCH', `/api/folders/${folder.id}/items/${inside.id}`, { parentId: planted.id, keyRev: 1, metaCt: cipher(300) });
  const kept = await file(ana, folder, 40);
  assert.equal((await rotate(ana, folder, [ids.ana], [kept])).status, 409, 'an item left out');
  assert.equal((await rotate(ben, folder, [ids.ben], [kept], { drop: [planted.id] })).status, 403);
  assert.equal((await rotate(ana, folder, [ids.ana], [kept], { drop: [planted.id] })).status, 200);
  assert.deepEqual((await ana('GET', `/api/folders/${folder.id}`)).data.items.map((i) => i.id), [kept.id]);
  assert.equal(blobRow(inside.blob.id), undefined);
  assert.deepEqual(chunkFiles(inside.blob.id), []);
});

test('a doc’s files wait too, and any key holder swaps in a copy once the doc points at it', async () => {
  const doc = crypto.randomBytes(16).toString('base64url');
  const grants = (list) => list.map((userId) => ({ userId, wrappedKey: cipher(92) }));
  assert.equal((await ana('POST', '/api/docs', { id: doc, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants: grants([ids.ana, ids.ben, ids.cy]) })).status, 200);
  const scope = { kind: 'doc', id: doc };
  const old = (await sealedBlob.upload(ana, scope, 300)).id;
  assert.equal((await ana('GET', `/api/docs/${doc}`)).data.doc.reseal, null);
  assert.equal((await ana('POST', `/api/docs/${doc}/rotate`, { baseVersion: 1, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants: grants([ids.ana, ids.ben]) })).status, 200);
  assert.deepEqual((await ben('GET', `/api/docs/${doc}`)).data.doc.reseal, { waiting: [old], copies: [] });
  const copy = (await sealedBlob.upload(ben, scope, 300, { replaces: old })).id;
  const other = (await sealedBlob.upload(ana, scope, 300, { replaces: old })).id;
  assert.deepEqual((await ana('GET', `/api/docs/${doc}`)).data.doc.reseal.copies.map((c) => c.replaces), [old, old]);
  assert.equal((await cy('POST', `/api/blobs/${copy}/adopt`)).status, 404);
  assert.equal((await ana('POST', `/api/blobs/${copy}/adopt`)).status, 200, 'Ana finishes what Ben’s tab started');
  for (const gone of [old, other]) assert.equal(blobRow(gone), undefined);
  assert.deepEqual([blobRow(copy).uploader_id, blobRow(copy).replaces], [ids.ana, null]);
  assert.equal((await ben('POST', `/api/blobs/${copy}/adopt`)).status, 404);
  assert.equal((await ana('GET', `/api/docs/${doc}`)).data.doc.reseal, null);
});

test('your unfinished uploads are listed, can be stopped, and go once nothing arrives for a while', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  const id = (await sealedBlob.start(ana, scopeOf(folder), 2 * MB)).data.blob;
  await sealedBlob.put(ana, id, 0, crypto.randomBytes(MB + 16));
  const mine = (await ana('GET', '/api/blobs')).data.uploads;
  assert.deepEqual(mine.map((u) => [u.id, u.chunks, u.received]), [[id, 2, 1]]);
  assert.deepEqual((await ana('GET', `/api/blobs/${id}/upload`)).data.received, [0]);
  assert.equal((await ben('GET', `/api/blobs/${id}/upload`)).status, 404);
  assert.deepEqual((await ben('GET', '/api/blobs')).data.uploads, []);
  const { default: sweepBlobs } = await import('../services/sweepBlobs.js');
  await sweepBlobs({ now: Date.now() + 4 * 60_000 });
  assert.ok(blobRow(id), 'still within SEALED_UPLOAD_IDLE_MINUTES');
  await sweepBlobs({ now: Date.now() + 6 * 60_000 });
  assert.equal(blobRow(id), undefined);
  const stop = (await sealedBlob.start(ana, scopeOf(folder), 10)).data.blob;
  assert.equal((await ana('DELETE', `/api/blobs/${stop}`)).status, 200);
  assert.deepEqual((await ana('GET', '/api/blobs')).data.uploads, []);
});

test('a chunk is taken once at a time, a few per person, and finishing checks every size on disk', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  const id = (await sealedBlob.start(ana, scopeOf(folder), 3 * MB)).data.blob;
  // a chunk whose bytes stop coming half way
  const stalled = [];
  const slow = (index) => {
    const url = new URL(`${base()}/api/blobs/${id}/chunks/${index}`);
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname, method: 'PUT', headers: { Cookie: ana.cookie(), 'X-NONOS': '1', 'Content-Type': 'application/octet-stream', 'Content-Length': MB + 16 } });
    req.on('error', () => {});
    req.write(Buffer.alloc(1000));
    stalled.push(req);
  };
  slow(0);
  await new Promise((r) => setTimeout(r, 200));
  const again = await sealedBlob.put(ana, id, 0, crypto.randomBytes(MB + 16));
  assert.equal(again.status, 429, 'that chunk is still on its way');
  assert.ok(Number(again.headers.get('retry-after')) > 0);
  slow(1);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await sealedBlob.put(ana, id, 2, crypto.randomBytes(MB + 16))).status, 429, 'two at once is SEALED_OPEN_CHUNKS here');

  // a dropped connection lets go of its chunk at once
  for (const req of stalled) req.destroy();
  const small = (await sealedBlob.start(ana, scopeOf(folder), 100)).data.blob;
  await until(async () => (await sealedBlob.put(ana, small, 0, crypto.randomBytes(116))).status === 200);
  fs.truncateSync(path.join(srv.dataDir, 'uploads', `${small}_0`), 50);
  assert.equal((await ana('POST', `/api/blobs/${small}/finish`)).status, 409, 'a chunk cut short on disk');
});

test('a thumbnail or chunk list is small, and doesn’t count as an upload of its own', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  assert.equal((await sealedBlob.start(ana, scopeOf(folder), 17 * 1024, { part: 'thumb' })).status, 413);
  assert.equal((await sealedBlob.start(ana, scopeOf(folder), 100, { part: 'cover' })).status, 400);
  for (let i = 0; i < 25; i++) assert.equal((await sealedBlob.start(ana, scopeOf(folder), 100, { part: 'thumb' })).status, 200, `thumbnail ${i}`);
  const big = await sealedBlob.upload(ana, scopeOf(folder), 100);
  const thumb = (await sealedBlob.upload(ana, scopeOf(folder), 17 * 1024)).id;
  assert.equal((await sharedFolder.add(ana, folder, { blobId: big.id, thumbId: thumb })).status, 400, 'a large blob as a thumbnail');
});
