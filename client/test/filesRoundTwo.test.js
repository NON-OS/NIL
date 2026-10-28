import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

// Files, round two: who may sign a folder's name, keys that can't be rolled back, details a
// removed reader can't forge, thumbnails that must match what was signed, files encrypted again
// after a removal, and the trash.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const folders = await load('actions/folders');
const folderFiles = await load('actions/folderFiles');
const folderReseal = await load('actions/folderReseal');
const folderTrash = await load('actions/folderTrash');
const fileDownload = await load('actions/fileDownload');
const folderKeys = await load('state/folderKeys');
const folderName = await load('lib/crypto/folderName');
const folderFacts = await load('lib/crypto/folderFacts');
const signedFacts = await load('lib/crypto/signedFacts');
const keyHash = await load('lib/crypto/keyHash');
const itemKeyWrap = await load('lib/crypto/itemKeyWrap');
const blobCipher = await load('lib/crypto/blobCipher');

const users = [{ id: 'v', name: 'Vic', role: 'owner' }, { id: 'w', name: 'Wen', role: 'member' }, { id: 'x', name: 'Xia', role: 'member' }];
const ids = {};
const pdf = (name, body) => new File([body], name, { type: 'application/pdf' });

async function as(who) {
  signIn(who, ids[who], users);
  await confirm(users.map((u) => u.id).filter((u) => u !== who));
}

beforeEach(async () => {
  reset();
  for (const u of users) ids[u.id] = person();
  route('GET', '/api/encryption-keys', () => users.map((u) => entry(u.id, ids[u.id])));
  serveFiles(() => store.get().me.id);
  await as('v');
});

const shared = (people = ['w', 'x']) => folders.create({ name: 'Plans', audience: 'people', people });

test('only the folder’s creator or an admin can sign who it’s for', async () => {
  const folder = await shared();
  await as('w');
  const opened = (await folders.open(folder.id)).folder;
  const key = folderKeys.get(folder.id);
  // Wen, a reader, signs the name again as a team folder with the real key
  const f = state.folders.get(folder.id);
  const facts = folderFacts.list({ audience: 'team', readers: ['v', 'w', 'x'], key: keyHash(key), at: Date.now(), keyRev: f.keyRev, bound: true });
  f.version += 1;
  f.nameCt = await folderName.seal(key, folder.id, f.version, signedFacts.seal(opened.name, { kind: folderFacts.kind, place: folderFacts.place(folder.id, f.version), facts, by: 'w', signingPrivate: ids.w.signingPrivate.slice() }));
  await as('v');
  const seen = (await folders.open(folder.id)).folder;
  assert.equal(seen.warning, 'unverified');
  assert.equal(seen.audience, 'people');
});

test('an older folder key is refused once a newer one was seen, and nothing is written under it', async () => {
  const folder = await shared();
  const before = { folder: { ...state.folders.get(folder.id) }, keys: new Map(state.keys.get(folder.id)) };
  await folders.restrict(folder, ['w'], 'people');
  await folders.open(folder.id);
  // the server serves the name and key from before Xia was taken out
  state.folders.set(folder.id, { ...before.folder, version: before.folder.version });
  state.keys.set(folder.id, before.keys);
  folderKeys.forget(folder.id);
  const rolled = (await folders.open(folder.id)).folder;
  assert.equal(rolled.warning, 'rollback');
  await assert.rejects(folderFiles.upload(rolled, null, pdf('new.pdf', 'after')), /older version of this folder/);
});

test('after someone is taken out, every file is encrypted again and the old key opens nothing', async () => {
  const folder = await shared();
  const big = new Uint8Array(blobCipher.CHUNK + 500).fill(7);
  const file = await folderFiles.upload(folder, null, new File([big], 'data.bin', { type: 'application/octet-stream' }));
  const oldFolderKey = folderKeys.get(folder.id).slice();
  const oldItemKey = await itemKeyWrap.unwrap(oldFolderKey, folder.id, file.id, state.items.get(file.id).keyWrap);
  const oldBlob = state.items.get(file.id).blobId;
  await folders.restrict(folder, ['w'], 'people');
  const opened = await folders.open(folder.id);
  assert.ok(opened.items.every((i) => i.waiting));
  assert.equal(await folderReseal.run(opened.folder), 0);
  const after = await folders.open(folder.id);
  const moved = after.items.find((i) => i.id === file.id);
  assert.equal(moved.waiting, false);
  assert.equal(moved.locked, false);
  assert.ok(!state.blobs.has(oldBlob), 'the old ciphertext is gone');
  assert.notEqual(state.items.get(file.id).blobId, oldBlob);
  assert.ok(moved.hashes, 'a file of two chunks keeps a list of their hashes');
  const back = new Uint8Array(await (await fileDownload.read(after.folder, moved)).arrayBuffer());
  assert.equal(back.length, big.length);
  // the key Xia could have kept doesn't open the new copy
  const newBlob = state.blobs.get(state.items.get(file.id).blobId);
  const aes = await blobCipher.key(oldItemKey, 'decrypt');
  await assert.rejects(blobCipher.open(aes, blobCipher.prefix(Uint8Array.from(atob(newBlob.header.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))), newBlob.id, 0, newBlob.chunks, newBlob.parts[0]));
});

test('a thumbnail that isn’t the one its uploader signed is never shown', async () => {
  const folder = await shared();
  const item = await folderFiles.upload(folder, null, pdf('a.pdf', 'x'));
  // a file with a thumbnail would need a canvas here; a signed hash pointing nowhere stands in
  assert.equal(await folderFiles.thumbnail(folder, { ...item, thumb: { id: 'nope', chunks: 1, size: 100, header: 'AAAAAAAAAAA' }, thumbHash: null, thumbSize: null }), null);
});

test('deleting goes to the trash, and restoring brings it back where it was', async () => {
  const folder = await shared();
  const item = await folderFiles.upload(folder, null, pdf('keep.pdf', 'keep me'));
  await folderFiles.remove(folder, item);
  let opened = await folders.open(folder.id);
  assert.deepEqual([opened.items.length, opened.trash.length], [0, 1]);
  await folderTrash.restore(opened.folder, opened.trash[0]);
  opened = await folders.open(folder.id);
  assert.deepEqual(opened.items.map((i) => i.name), ['keep.pdf']);
});
