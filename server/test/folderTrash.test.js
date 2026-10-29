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

// Who may change and delete what in a shared folder, and its trash: a reader changes only what
// they added, a delete that would take someone else's things along needs whoever manages the
// folder, and nothing deleted is gone until it has sat in the trash for FILES_TRASH_DAYS or
// someone empties it. Bulk moves and deletes follow the same rules, all or nothing.
let srv;
let sql;
let folderTrash;
const base = () => srv.base;
const people = { owner: client(base), ana: client(base), ben: client(base) };
const { owner, ana, ben } = people;
const ids = {};
const DAY = 86_400_000;

const chunkFiles = (id) => fs.readdirSync(path.join(srv.dataDir, 'uploads')).filter((n) => n.startsWith(`${id}_`));
const listing = async (c, folder) => (await c('GET', `/api/folders/${folder.id}`)).data.items;
const live = async (c, folder) => (await listing(c, folder)).filter((i) => !i.deletedAt).map((i) => i.id).sort();
const file = async (c, folder, extra = {}) => {
  const { id } = await sealedBlob.upload(c, { kind: 'folder', id: folder.id }, 64);
  const res = await sharedFolder.add(c, folder, { blobId: id, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.item;
};
const sub = async (c, folder, extra = {}) => (await sharedFolder.add(c, folder, { kind: 'folder', ...extra })).data.item;
const patch = (c, folder, item, extra = {}) => c('PATCH', `/api/folders/${folder.id}/items/${item.id}`, { parentId: null, keyRev: 1, metaCt: cipher(300), ...extra });
const del = (c, folder, item) => c('DELETE', `/api/folders/${folder.id}/items/${item.id}`);

before(async () => {
  srv = await startServer({ env: { FOLDER_DEPTH_MAX: '3', FILES_BULK_MAX: '4', FILES_TRASH_DAYS: '2' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: folderTrash } = await import('../services/folderTrash.js'));
  const w = Object.fromEntries(Object.keys(people).map((k) => [k, wallet()]));
  ids.owner = (await owner.wallet(w.owner, 'setup', { name: 'Owner', workspaceName: 'Trash' })).data.user.id;
  for (const who of ['ana', 'ben']) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await people[who].wallet(w[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
  for (const who of Object.keys(people)) await publishKey(people[who], w[who]);
});
after(() => srv.close());

test('a reader can’t move another’s file into their own folder and delete it with the folder', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  const anas = await file(ana, folder);
  const trap = await sub(ben, folder);
  assert.equal((await patch(ben, folder, anas, { parentId: trap.id })).status, 403, 'Ben may not move Ana’s file');
  assert.equal((await patch(ben, folder, anas, { parentId: null })).status, 403, 'nor seal its details again');
  // had it got in there anyway, deleting Ben's folder would take a file that isn't his
  assert.equal((await patch(ana, folder, anas, { parentId: trap.id })).status, 200, 'Ana may');
  assert.equal((await del(ben, folder, trap)).status, 403);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/remove`, { ids: [trap.id] })).status, 403);
  assert.equal((await del(ana, folder, trap)).status, 200, 'Ana made the shared folder, so she manages it');
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id = ?', anas.blob.id).n, 1, 'in the trash, the file still exists');
  assert.ok(chunkFiles(anas.blob.id).length);
});

test('deleting puts things in the trash, where they can’t be changed, and restoring brings them back', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  const box = await sub(ben, folder);
  const inner = await file(ben, folder, { parentId: box.id });
  const deeper = await sub(ben, folder, { parentId: box.id });
  assert.equal((await del(ben, folder, box)).status, 200, 'all of it is Ben’s');
  assert.deepEqual(await live(ana, folder), []);
  const trashed = (await listing(ana, folder)).filter((i) => i.deletedAt);
  assert.deepEqual(trashed.map((i) => [i.trashRoot, i.deletedBy]), [box, inner, deeper].map(() => [box.id, ids.ben]));
  assert.equal((await patch(ben, folder, inner)).status, 404, 'a file in the trash can’t be changed');
  assert.equal((await sharedFolder.add(ben, folder, { kind: 'folder', parentId: box.id })).status, 400, 'nor added to');
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${inner.id}/restore`)).status, 404, 'only what was deleted on its own comes back on its own');

  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${box.id}/restore`)).status, 200);
  assert.deepEqual(await live(ana, folder), [box.id, inner.id, deeper.id].sort());
  // deleted alone, then with its folder: it comes back by itself only somewhere live
  assert.equal((await del(ben, folder, deeper)).status, 200);
  assert.equal((await del(ben, folder, box)).status, 200);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${deeper.id}/restore`)).status, 409);
  const moved = await ben('POST', `/api/folders/${folder.id}/items/${deeper.id}/restore`, { parentId: null, keyRev: 1, metaCt: cipher(300) });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.item.parentId, null);
});

test('only whoever deleted something, added all of it or manages the folder empties it from the trash', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.owner]);
  const bens = await file(ben, folder);
  const anas = await file(ana, folder);
  assert.equal((await del(ben, folder, bens)).status, 200);
  assert.equal((await del(ana, folder, anas)).status, 200);
  assert.equal((await ben('DELETE', `/api/folders/${folder.id}/trash/${anas.id}`)).status, 403);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/${anas.id}/restore`)).status, 403);
  assert.equal((await ben('DELETE', `/api/folders/${folder.id}/trash/${bens.id}`)).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id = ?', bens.blob.id).n, 0);
  assert.deepEqual(chunkFiles(bens.blob.id), []);
  assert.equal((await owner('DELETE', `/api/folders/${folder.id}/trash/${anas.id}`)).status, 200, 'an admin manages every folder');
});

test('what sits in the trash longer than FILES_TRASH_DAYS goes, blobs and all', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  const old = await file(ana, folder);
  const fresh = await file(ana, folder);
  await del(ana, folder, old);
  sql.run('UPDATE folder_items SET deleted_at = ? WHERE id = ?', Date.now() - 3 * DAY, old.id);
  await del(ana, folder, fresh);
  assert.equal(await folderTrash.purge(), 1);
  assert.deepEqual((await listing(ana, folder)).map((i) => i.id), [fresh.id]);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM sealed_blobs WHERE id = ?', old.blob.id).n, 0);
  assert.deepEqual(chunkFiles(old.blob.id), []);
});

test('bulk moves and deletes are all or nothing, a few at a time', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben]);
  const [a, b] = [await file(ben, folder), await file(ben, folder)];
  const anas = await file(ana, folder);
  const into = await sub(ben, folder);
  const move = (c, list, extra = {}) => c('POST', `/api/folders/${folder.id}/items/move`, { parentId: into.id, keyRev: 1, items: list.map((i) => ({ id: i.id, metaCt: cipher(300) })), ...extra });
  assert.equal((await move(ben, [a, anas])).status, 403, 'one of them isn’t Ben’s');
  assert.equal((await move(ben, [a, a])).status, 400);
  assert.equal((await move(ben, [a, b, anas, into, a])).status, 413, 'more than FILES_BULK_MAX');
  assert.equal((await move(ben, [a, b], { keyRev: 2 })).status, 409);
  assert.equal((await move(ben, [into])).status, 400, 'a folder into itself');
  assert.deepEqual((await listing(ben, folder)).filter((i) => i.parentId === into.id), []);
  const moved = await move(ben, [a, b]);
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data.items.map((i) => i.parentId), [into.id, into.id]);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/remove`, { ids: [into.id, anas.id] })).status, 403);
  assert.equal((await ben('POST', `/api/folders/${folder.id}/items/remove`, { ids: [into.id, a.id] })).status, 200, 'a file inside a folder picked goes with it');
  assert.deepEqual(await live(ben, folder), [anas.id]);
  assert.deepEqual((await listing(ben, folder)).filter((i) => i.deletedAt).map((i) => i.trashRoot), [into.id, into.id, into.id]);
});

test('folders nest at most FOLDER_DEPTH_MAX deep, moves included', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana]);
  const one = await sub(ana, folder);
  const two = await sub(ana, folder, { parentId: one.id });
  const three = await sub(ana, folder, { parentId: two.id });
  assert.equal((await sharedFolder.add(ana, folder, { kind: 'folder', parentId: three.id })).status, 400);
  const other = await sub(ana, folder);
  await sub(ana, folder, { parentId: other.id });
  assert.equal((await patch(ana, folder, other, { parentId: two.id })).status, 400, 'a folder two deep under a folder two deep');
  assert.equal((await patch(ana, folder, other, { parentId: one.id })).status, 200);
});

test('only whoever manages a folder may rename it, since the name says who it’s for', async () => {
  const folder = await sharedFolder.create(ana, [ids.ana, ids.ben, ids.owner]);
  assert.equal((await ben('PUT', `/api/folders/${folder.id}`, { baseVersion: 1, nameCt: cipher(120) })).status, 403);
  assert.equal((await owner('PUT', `/api/folders/${folder.id}`, { baseVersion: 1, nameCt: cipher(120) })).status, 200);
});
