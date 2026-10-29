import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import cipher from './helpers/cipher.js';
import sealedBlob from './helpers/sealedBlob.js';
import sharedFolder from './helpers/sharedFolder.js';

// Shared folders as an attacker meets them: people reaching into folders they hold no key to,
// files pointed at someone else's blob or a blob in another folder, folders moved inside
// themselves, a key replacement that leaves a file behind, and deletes by the wrong people. And
// the server is never handed a name it could show.
let srv;
let sql;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base), cy: client(base) };
const { owner, ana, ben, cy } = people;
const ids = {};
const SCRIPT = '<img src=x onerror=alert(1)>.pdf';

const chunkFiles = (id) => fs.readdirSync(path.join(srv.dataDir, 'uploads')).filter((name) => name.startsWith(`${id}_`));
const items = async (c, folder) => (await c('GET', `/api/folders/${folder.id}`)).data.items;
const file = async (c, folder, extra = {}) => {
  const { id } = await sealedBlob.upload(c, { kind: 'folder', id: folder.id }, 64);
  const res = await sharedFolder.add(c, folder, { blobId: id, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.item;
};

before(async () => {
  srv = await startServer({ env: { FOLDER_ITEMS_MAX: '12' } });
  ({ default: sql } = await import('../db/sql.js'));
  const wallets = Object.fromEntries(Object.keys(people).map((who) => [who, wallet()]));
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Olivia Owner', workspaceName: 'Folders' })).data.user.id;
  for (const who of ['ana', 'ben', 'cy']) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await people[who].wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
  for (const who of Object.keys(people)) await publishKey(people[who], wallets[who]);
});
after(() => srv.close());

test('only readers see a folder and what’s in it; a team folder waits for the rest', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  await file(ana, folder);
  assert.equal((await items(ben, folder)).length, 1);
  for (const c of [cy, owner]) {
    assert.equal((await c('GET', `/api/folders/${folder.id}`)).status, 404);
    assert.equal((await c('POST', `/api/folders/${folder.id}/items`, sharedFolder.item(folder, { kind: 'folder' }))).status, 404);
    assert.ok(!(await c('GET', '/api/folders')).data.folders.some((f) => f.id === folder.id));
  }
  // Ben can read but can't let more people into a folder for specific people
  assert.equal((await ben('POST', `/api/folders/${folder.id}/grants`, { grants: sharedFolder.grants([ids.cy]) })).status, 403);
  const team = await sharedFolder.create(ana, [ids.ana], { audience: 'team' });
  assert.deepEqual((await cy('GET', '/api/folders')).data.waiting.map((w) => w.id), [team.id]);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/grants`, { grants: [{ userId: ids.cy, wrappedKey: cipher(91) }] })).status, 403);
  assert.equal((await ana('POST', '/api/folders', { id: 'short', audience: 'team', nameCt: cipher(120), grants: sharedFolder.grants([ids.ana]) })).status, 400);
  assert.equal((await ana('POST', '/api/folders', { id: sharedFolder.freshId(), audience: 'team', nameCt: cipher(120), grants: sharedFolder.grants([ids.ben]) })).status, 400, 'a folder its maker couldn’t open');
});

test('a file must point at a finished blob its adder uploaded to this folder, and only once', async () => {
  const mine = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  const other = await sharedFolder.create(ana, [ids.ana]);
  const elsewhere = (await sealedBlob.upload(ana, { kind: 'folder', id: other.id })).id;
  const bens = (await sealedBlob.upload(ben, { kind: 'folder', id: mine.id })).id;
  const open = (await sealedBlob.start(ana, { kind: 'folder', id: mine.id }, 10)).data.blob;
  const docBlob = crypto.randomUUID();
  for (const blobId of [elsewhere, bens, open, docBlob, undefined]) assert.equal((await sharedFolder.add(ana, mine, { blobId })).status, 400, String(blobId));
  const used = await file(ana, mine);
  assert.equal((await sharedFolder.add(ana, mine, { blobId: used.blob.id })).status, 400, 'a blob already a file');
  assert.equal((await sharedFolder.add(ana, mine, { blobId: used.blob.id, kind: 'folder' })).status, 400);
  for (const bad of [{ keyWrap: cipher(59) }, { metaCt: 'not ciphertext' }, { kind: 'link' }, { id: 'short' }, { id: used.id }, { id: mine.id }]) {
    assert.equal((await sharedFolder.add(ana, mine, { kind: 'folder', ...bad })).status, 400, JSON.stringify(bad));
  }
  // the server is never handed a name, and nothing it's sent beside the ciphertext comes back
  const res = await sharedFolder.add(ana, mine, { kind: 'folder', name: SCRIPT, filename: SCRIPT });
  assert.equal(res.status, 200);
  assert.equal(JSON.stringify(res.data).includes('onerror'), false);
  assert.equal(JSON.stringify(sql.all('SELECT * FROM folder_items')).includes('onerror'), false);
});

test('a folder can’t go inside itself or into another shared folder', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  const other = await sharedFolder.create(ana, [ids.ana]);
  const a = (await sharedFolder.add(ana, folder, { kind: 'folder' })).data.item;
  const b = (await sharedFolder.add(ana, folder, { kind: 'folder', parentId: a.id })).data.item;
  const c = (await sharedFolder.add(ana, folder, { kind: 'folder', parentId: b.id })).data.item;
  const foreign = (await sharedFolder.add(ana, other, { kind: 'folder' })).data.item;
  const move = (item, parentId) => ana('PATCH', `/api/folders/${folder.id}/items/${item.id}`, { parentId, keyRev: 1, metaCt: cipher(300) });
  assert.equal((await move(a, a.id)).status, 400);
  assert.equal((await move(a, c.id)).status, 400, 'into its own grandchild');
  assert.equal((await move(a, foreign.id)).status, 400);
  assert.equal((await sharedFolder.add(ana, folder, { kind: 'folder', parentId: foreign.id })).status, 400);
  const f = await file(ana, folder);
  assert.equal((await move(c, f.id)).status, 400, 'into a file');
  assert.equal((await ana('PATCH', `/api/folders/${other.id}/items/${a.id}`, { parentId: null, keyRev: 1, metaCt: cipher(300) })).status, 404);
  assert.equal((await ana('PATCH', `/api/folders/${folder.id}/items/${c.id}`, { parentId: null, keyRev: 2, metaCt: cipher(300) })).status, 409, 'details sealed under another folder key');
  assert.equal((await move(c, null)).status, 200);
  assert.equal((await items(ana, folder)).find((i) => i.id === c.id).parentId, null);
});

test('a new folder key re-wraps every file key, all or nothing, and shuts out who was taken out', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.cy]);
  const [one, two] = [await file(ana, folder), await file(cy, folder)];
  const fresh = (list) => list.map((i) => ({ id: i.id, keyWrap: cipher(60), metaCt: cipher(300) }));
  const rotate = (c, extra) => c('POST', `/api/folders/${folder.id}/rotate`, { baseVersion: 1, audience: 'people', nameCt: cipher(120), grants: sharedFolder.grants([ids.ana, ids.ben]), items: fresh([one, two]), ...extra });
  assert.equal((await rotate(ben)).status, 403, 'Ben didn’t make the folder');
  assert.equal((await rotate(ana, { items: fresh([one]) })).status, 409, 'a file left behind');
  assert.equal((await rotate(ana, { items: [one, two].map((i) => ({ id: i.id, keyWrap: cipher(59), metaCt: cipher(300) })) })).status, 400);
  assert.equal((await rotate(ana, { items: [one, two].map((i) => ({ id: i.id, keyWrap: cipher(60) })) })).status, 400, 'details not encrypted again');
  assert.equal((await rotate(ana, { baseVersion: 2 })).status, 409);
  assert.equal((await rotate(ana, { grants: sharedFolder.grants([ids.ben]) })).status, 400);
  assert.deepEqual((await items(ana, folder)).map((i) => i.keyWrap), [one.keyWrap, two.keyWrap], 'nothing changed');

  const wraps = fresh([one, two]);
  assert.equal((await rotate(ana, { items: wraps })).status, 200);
  assert.deepEqual((await items(ben, folder)).map((i) => [i.keyWrap, i.metaCt]), wraps.map((w) => [w.keyWrap, w.metaCt]));
  assert.equal((await cy('GET', `/api/folders/${folder.id}`)).status, 404);
  assert.equal((await cy('GET', `/api/blobs/${two.blob.id}`)).status, 404, 'Cy can’t fetch even the file she uploaded');
  // a file wrapped under the old key is refused, so nobody's left with one they can't open
  assert.equal((await sharedFolder.add(ana, folder, { kind: 'folder' })).status, 409);
  assert.equal((await sharedFolder.add(ana, { ...folder, keyRev: 2 }, { kind: 'folder' })).status, 200);
});

test('only whoever added something, or an admin, deletes it, and a folder goes with all it holds', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.owner]);
  const sub = (await sharedFolder.add(ana, folder, { kind: 'folder' })).data.item;
  const inner = await file(ben, folder, { parentId: sub.id });
  const thumbless = await file(ana, folder);
  const del = (c, item) => c('DELETE', `/api/folders/${folder.id}/items/${item.id}`);
  const live = async () => (await items(ana, folder)).filter((i) => !i.deletedAt).map((i) => i.id);
  assert.equal((await del(ben, sub)).status, 403);
  assert.equal((await del(ana, inner)).status, 200, 'Ana made the folder, so she manages what’s in it');
  assert.equal((await ana('POST', `/api/folders/${folder.id}/items/${inner.id}/restore`)).status, 200);
  assert.equal((await ana('DELETE', `/api/blobs/${thumbless.blob.id}`)).status, 409, 'a file’s blob goes with the file');
  assert.equal((await del(ana, sub)).status, 200);
  assert.deepEqual(await live(), [thumbless.id]);
  assert.equal((await ana('DELETE', `/api/folders/${folder.id}/trash/${sub.id}`)).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id = ?', inner.blob.id).n, 0);
  assert.deepEqual(chunkFiles(inner.blob.id), []);
  assert.equal((await del(owner, thumbless)).status, 200, 'an admin may');
  assert.equal((await ben('DELETE', `/api/folders/${folder.id}`)).status, 403);
  const last = await file(ben, folder);
  assert.equal((await ana('DELETE', `/api/folders/${folder.id}`)).status, 200);
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM sealed_blobs WHERE scope_kind = 'folder' AND scope_id = ?", folder.id).n, 0);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM folder_keys WHERE folder_id = ?', folder.id).n, 0);
  assert.deepEqual(chunkFiles(last.blob.id), []);
});

test('a folder holds at most FOLDER_ITEMS_MAX things, and renames start from the version they change', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  for (let i = 0; i < 12; i++) assert.equal((await sharedFolder.add(ana, folder, { kind: 'folder' })).status, 200);
  assert.equal((await sharedFolder.add(ana, folder, { kind: 'folder' })).status, 413);
  assert.equal((await ben('PUT', `/api/folders/${folder.id}`, { baseVersion: 1, nameCt: cipher(120) })).status, 403, 'only whoever manages the folder names it');
  assert.equal((await ana('PUT', `/api/folders/${folder.id}`, { baseVersion: 1, nameCt: cipher(120) })).status, 200);
  assert.equal((await ana('PUT', `/api/folders/${folder.id}`, { baseVersion: 1, nameCt: cipher(120) })).status, 409);
});
