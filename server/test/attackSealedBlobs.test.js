import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import cipher from './helpers/cipher.js';
import until from './helpers/until.js';
import sealedBlob from './helpers/sealedBlob.js';
import sharedFolder from './helpers/sharedFolder.js';

// The sealed blob store as an attacker meets it: people reaching into docs and folders they hold
// no key to, uploads that lie about their size or pile past a quota, chunks sent out of turn or
// after the end, and downloads that try to become a page on the app's origin.
let srv;
let sql;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base), rae: client(base), guest: client(base) };
const { owner, ana, ben, cy, rae, guest } = people;
const ids = {};
const MB = 1024 * 1024;

const uploads = () => path.join(srv.dataDir, 'uploads');
const chunkFiles = (id) => fs.readdirSync(uploads()).filter((name) => name.startsWith(`${id}_`));
const docScope = () => ({ kind: 'doc', id: ids.doc });
const folderScope = () => ({ kind: 'folder', id: ids.folder });
const raw = (c, url) => fetch(`${base()}${url}`, { headers: { Cookie: c.cookie() } });

before(async () => {
  srv = await startServer({ env: { SEALED_FILE_MAX_MB: '3', UPLOAD_QUOTA_PER_MEMBER_MB: '6', SEALED_UPLOADS_PER_HOUR: '30', SEALED_CHUNKS_PER_MINUTE: '40', SEALED_UPLOAD_STALE_MINUTES: '30' } });
  ({ default: sql } = await import('../db/sql.js'));
  const wallets = Object.fromEntries(Object.keys(people).map((who) => [who, wallet()]));
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Olivia Owner', workspaceName: 'Blobs' })).data.user.id;
  const project = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  for (const who of ['ana', 'ben', 'cy', 'rae', 'guest']) {
    const inv = await owner('POST', '/api/invites', who === 'guest' ? { role: 'guest', projectIds: [project] } : { role: 'member' });
    ids[who] = (await people[who].wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
  for (const who of ['owner', 'ana', 'ben', 'cy', 'rae']) await publishKey(people[who], wallets[who]);
  // a doc only Ana and Ben hold keys to, and a folder only Ana and Cy do
  ids.doc = crypto.randomBytes(16).toString('base64url');
  const grants = [ids.ana, ids.ben].map((userId) => ({ userId, wrappedKey: cipher(92) }));
  assert.equal((await ana('POST', '/api/docs', { id: ids.doc, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants })).status, 200);
  ids.folder = (await sharedFolder.create(ana, [ids.ana, ids.cy])).id;
});
after(() => srv.close());

test('only people holding a key to the doc or folder put a blob in or get one out', async () => {
  const { id } = await sealedBlob.upload(ana, docScope(), 2000);
  assert.equal((await sealedBlob.start(cy, docScope(), 10)).status, 404, 'Cy holds no key to the doc');
  assert.equal((await sealedBlob.start(ben, folderScope(), 10)).status, 404, 'Ben holds no key to the folder');
  assert.equal((await sealedBlob.start(guest, docScope(), 10)).status, 403);
  assert.equal((await fetch(`${base()}/api/blobs`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(sealedBlob.body(docScope(), 10)) })).status, 401);
  for (const scope of [{ kind: 'task', id: ids.doc }, { kind: 'doc', id: '../x' }, { kind: 'doc' }, null]) assert.equal((await ana('POST', '/api/blobs', { ...sealedBlob.body(docScope(), 10), scope })).status, 400);

  assert.equal((await ben('GET', `/api/blobs/${id}`)).status, 200);
  assert.equal((await raw(ben, `/api/blobs/${id}/chunks/0`)).status, 200);
  for (const c of [cy, owner]) {
    assert.equal((await c('GET', `/api/blobs/${id}`)).status, 404);
    assert.equal((await raw(c, `/api/blobs/${id}/chunks/0`)).status, 404);
    assert.equal((await c('DELETE', `/api/blobs/${id}`)).status, 404);
  }
  assert.equal((await guest('GET', `/api/blobs/${id}`)).status, 403);
  assert.equal((await fetch(`${base()}/api/blobs/${id}`)).status, 401);
  // Ben can read it but didn't upload it, made the doc or run the workspace
  assert.equal((await ben('DELETE', `/api/blobs/${id}`)).status, 403);

  // taking Ben's key away takes the blob away from him too
  await ana('POST', `/api/docs/${ids.doc}/rotate`, { baseVersion: 1, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants: [{ userId: ids.ana, wrappedKey: cipher(92) }] });
  assert.equal((await ben('GET', `/api/blobs/${id}`)).status, 404);
  await ana('POST', `/api/docs/${ids.doc}/grants`, { grants: [{ userId: ids.ben, wrappedKey: cipher(92) }] });
});

test('an upload is someone’s own until it’s finished, and a finished blob never changes', async () => {
  const started = await sealedBlob.start(ana, docScope(), MB + 10);
  const id = started.data.blob;
  const [first, second] = sealedBlob.sizes(MB + 10).map((n) => crypto.randomBytes(n));
  assert.equal((await sealedBlob.put(ben, id, 0, first)).status, 404, 'Ben can read the doc but this upload is Ana’s');
  assert.equal((await ben('POST', `/api/blobs/${id}/finish`)).status, 404);
  assert.equal((await ben('GET', `/api/blobs/${id}`)).status, 404, 'an unfinished blob isn’t there to fetch');
  assert.equal((await sealedBlob.put(ana, id, 0, first)).status, 200);
  assert.equal((await ana('POST', `/api/blobs/${id}/finish`)).status, 409, 'a chunk is missing');
  assert.equal((await sealedBlob.put(ana, id, 1, second)).status, 200);
  assert.equal((await ana('POST', `/api/blobs/${id}/finish`)).status, 200);
  assert.equal((await sealedBlob.put(ana, id, 1, crypto.randomBytes(second.length))).status, 404, 'no chunk goes into a finished blob');
  assert.deepEqual(new Uint8Array(await (await raw(ben, `/api/blobs/${id}/chunks/1`)).arrayBuffer()), new Uint8Array(second));
  assert.deepEqual(chunkFiles(id).sort(), [`${id}_0`, `${id}_1`]);
});

test('sizes are checked before a byte is read: the whole, each chunk, and the cap', async () => {
  const body = sealedBlob.body(docScope(), MB + 10);
  for (const wrong of [{ chunks: 1 }, { chunks: 3 }, { size: sealedBlob.CHUNK + 16 + 5 }, { size: 15, chunks: 1 }, { size: 0, chunks: 1 }, { size: '100' }, { chunks: '2' }]) {
    assert.equal((await ana('POST', '/api/blobs', { ...body, ...wrong })).status, 400, JSON.stringify(wrong));
  }
  assert.equal((await ana('POST', '/api/blobs', { ...body, header: cipher(9) })).status, 400);
  assert.equal((await sealedBlob.start(ana, docScope(), 3 * MB + 1)).status, 413, 'over SEALED_FILE_MAX_MB');

  const id = (await ana('POST', '/api/blobs', body)).data.blob;
  const full = sealedBlob.CHUNK + sealedBlob.TAG;
  assert.equal((await sealedBlob.put(ana, id, 0, crypto.randomBytes(full + 1))).status, 413);
  assert.equal((await sealedBlob.put(ana, id, 0, crypto.randomBytes(full - 1))).status, 400);
  assert.equal((await sealedBlob.put(ana, id, 1, crypto.randomBytes(full))).status, 413, 'the last chunk holds only what’s left');
  for (const index of ['2', '-1', '1e3', '01x', '..%2F..%2Fnonos.db']) assert.equal((await sealedBlob.put(ana, id, index, crypto.randomBytes(26))).status, 404, index);
  // a body that runs past what it announced is cut off and leaves nothing behind
  const liar = await fetch(`${base()}/api/blobs/${id}/chunks/1`, { method: 'PUT', headers: { 'X-NONOS': '1', Cookie: ana.cookie(), 'Content-Type': 'application/octet-stream' }, body: crypto.randomBytes(5 * MB) }).catch(() => ({ status: 'reset' }));
  assert.ok([413, 'reset'].includes(liar.status), String(liar.status));
  assert.deepEqual(chunkFiles(id), []);
  assert.ok(fs.readdirSync(uploads()).every((name) => !name.endsWith('.in') && !name.endsWith('.part')));
});

test('quotas count uploads from the moment they start, finished or not', async () => {
  const blobs = [];
  for (let i = 0; i < 2; i++) blobs.push((await sealedBlob.start(cy, folderScope(), 2.5 * MB)).data.blob);
  assert.ok(blobs.every(Boolean));
  const refused = await sealedBlob.start(cy, folderScope(), MB);
  assert.equal(refused.status, 413);
  assert.match(refused.data.error, /6 MB of file space/);
  assert.equal((await cy('DELETE', `/api/blobs/${blobs[0]}`)).status, 200);
  assert.equal((await sealedBlob.start(cy, folderScope(), MB)).status, 200);
  const used = sql.get('SELECT SUM(size) AS n FROM sealed_blobs WHERE uploader_id = ?', ids.cy).n;
  assert.equal((await cy('GET', '/api/folders')).data.usage.used, used);
});

test('uploads and chunks per person are rate-limited', async () => {
  const folder = await sharedFolder.create(rae, [ids.rae]);
  const scope = { kind: 'folder', id: folder.id };
  const id = (await sealedBlob.start(rae, scope, 10)).data.blob;
  let status = 200;
  for (let i = 0; i < 30 && status === 200; i++) status = (await sealedBlob.start(rae, scope, 10)).status;
  assert.equal(status, 429);
  const statuses = [];
  for (let i = 0; i < 42; i++) statuses.push((await sealedBlob.put(rae, id, 0, crypto.randomBytes(26))).status);
  assert.ok(statuses.includes(429), 'SEALED_CHUNKS_PER_MINUTE stops a flood of chunk requests');
});

test('a chunk only ever downloads as opaque bytes in a sandbox', async () => {
  const page = Buffer.from('<html><script>alert(document.cookie)</script></html>'.padEnd(116, ' '));
  const id = (await sealedBlob.start(ana, docScope(), page.length - 16)).data.blob;
  await sealedBlob.put(ana, id, 0, page);
  await ana('POST', `/api/blobs/${id}/finish`);
  const res = await raw(ben, `/api/blobs/${id}/chunks/0`);
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.equal(res.headers.get('content-disposition'), 'attachment');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /^default-src 'none'; sandbox$/);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), page);
  // the server is never told a name, so there's none to break a header or a page with
  const info = (await ben('GET', `/api/blobs/${id}`)).data;
  assert.deepEqual(Object.keys(info).sort(), ['chunks', 'header', 'id', 'size']);
});

test('deleting a doc takes its blobs with it, chunk files included', async () => {
  const doc = crypto.randomBytes(16).toString('base64url');
  await ana('POST', '/api/docs', { id: doc, titleCt: cipher(40), bodyCt: cipher(100), audience: 'people', grants: [{ userId: ids.ana, wrappedKey: cipher(92) }] });
  const { id } = await sealedBlob.upload(ana, { kind: 'doc', id: doc }, MB + 5);
  const open = (await sealedBlob.start(ana, { kind: 'doc', id: doc }, 10)).data.blob;
  assert.equal(chunkFiles(id).length, 2);
  assert.equal((await ana('DELETE', `/api/docs/${doc}`)).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id IN (?, ?)', id, open).n, 0);
  await until(() => chunkFiles(id).length === 0);
});

test('the sweep throws away stale uploads and files no folder took in, and nothing else', async () => {
  const { default: sweepBlobs } = await import('../services/sweepBlobs.js');
  const kept = (await sealedBlob.upload(ana, docScope(), 10)).id;
  const stale = (await sealedBlob.start(ana, docScope(), MB + 5)).data.blob;
  await sealedBlob.put(ana, stale, 0, crypto.randomBytes(MB + 16));
  const orphan = (await sealedBlob.upload(cy, folderScope(), 10)).id;
  const used = (await sealedBlob.upload(cy, folderScope(), 10)).id;
  assert.equal((await cy('POST', `/api/folders/${ids.folder}/items`, sharedFolder.item({ id: ids.folder, keyRev: 1 }, { blobId: used }))).status, 200);
  fs.writeFileSync(path.join(uploads(), `${stale}_1.leftover.in`), 'x');

  await sweepBlobs();
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id IN (?, ?, ?, ?)', kept, stale, orphan, used).n, 4, 'nothing is stale yet');
  await sweepBlobs({ now: Date.now() + 31 * 60_000 });
  const left = sql.all('SELECT id FROM sealed_blobs WHERE id IN (?, ?, ?, ?)', kept, stale, orphan, used).map((r) => r.id).sort();
  assert.deepEqual(left, [kept, used].sort());
  assert.deepEqual([...chunkFiles(stale), ...chunkFiles(orphan)], []);
  assert.equal(chunkFiles(kept).length, 1);
});
