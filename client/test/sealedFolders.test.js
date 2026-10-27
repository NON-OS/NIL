import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519';
import { store, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const folders = await load('actions/folders');
const folderFiles = await load('actions/folderFiles');
const fileDownload = await load('actions/fileDownload');
const folderKeys = await load('state/folderKeys');
const itemKeyWrap = await load('lib/crypto/itemKeyWrap');
const blobCipher = await load('lib/crypto/blobCipher');
const folderKeySeal = await load('lib/crypto/folderKeySeal');
const folderName = await load('lib/crypto/folderName');
const folderFacts = await load('lib/crypto/folderFacts');
const signedFacts = await load('lib/crypto/signedFacts');
const keyHash = await load('lib/crypto/keyHash');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'x', name: 'Xia' }];
const ids = {};
const text = (s) => new TextEncoder().encode(s);
const pdf = (name, body) => new File([body], name, { type: 'application/pdf' });

// Signs in as someone with their keys unlocked and their teammates' keys confirmed, the way a
// fresh tab would after unlocking: folder keys from the last person are gone.
async function as(who) {
  store.set({ docsUnlocked: false });
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

const shared = async (people = ['w']) => folders.create({ name: 'Contracts', audience: 'people', people });
const listed = async (folderId) => (await folders.open(folderId)).items;
const byName = (items, name) => items.find((i) => i.name === name);

test('a file in a shared folder opens for its readers, signed by whoever added it', async () => {
  const folder = await shared();
  const offer = await folderFiles.upload(folder, null, pdf('offer.pdf', 'Offer: 120k'));
  const signed = await folderFiles.newFolder(folder, null, 'Signed');
  assert.deepEqual([offer.name, offer.type, offer.size, offer.by, offer.locked], ['offer.pdf', 'application/pdf', 11, 'v', false]);
  assert.deepEqual([signed.kind, signed.name], ['folder', 'Signed']);

  await as('w');
  const opened = await folders.open(folder.id);
  assert.deepEqual([opened.folder.name, opened.folder.warning, opened.folder.updatedBy], ['Contracts', null, 'v']);
  const file = byName(opened.items, 'offer.pdf');
  assert.equal(file.locked, false);
  assert.equal(await (await fileDownload.read(opened.folder, file)).text(), 'Offer: 120k');
  // a subfolder's address opens its whole folder
  assert.equal((await folders.open(signed.id)).folder.id, folder.id);

  await as('x');
  assert.deepEqual((await folders.list()).folders, []);
});

test('the server can’t move, swap or re-point what a teammate signed', async () => {
  const folder = await shared();
  const a = await folderFiles.upload(folder, null, pdf('a.pdf', 'first file'));
  const b = await folderFiles.upload(folder, null, pdf('b.pdf', 'second one'));
  const sub = await folderFiles.newFolder(folder, null, 'Inside');
  const stored = (item) => state.items.get(item.id);
  const original = new Map([...state.items].map(([k, v]) => [k, { ...v }]));
  const locked = async (what) => {
    await as('w');
    const items = await listed(folder.id);
    assert.ok(items.some((i) => i.locked), what);
    for (const [k, v] of original) state.items.set(k, { ...v });
    await as('v');
  };

  [stored(a).metaCt, stored(b).metaCt] = [stored(b).metaCt, stored(a).metaCt];
  await locked('details swapped between two files');
  stored(a).parentId = sub.id;
  await locked('a file moved into a subfolder nobody moved it to');
  [stored(a).blobId, stored(b).blobId] = [stored(b).blobId, stored(a).blobId];
  await locked('two files’ contents swapped');
  stored(a).keyWrap = stored(b).keyWrap;
  await locked('one file’s key given to another');
  stored(sub).kind = 'file';
  await locked('a folder passed off as a file');

  await as('w');
  assert.ok((await listed(folder.id)).every((i) => !i.locked));
});

test('bytes that aren’t the ones the uploader signed don’t open, even under the right key', async () => {
  const folder = await shared();
  const item = await folderFiles.upload(folder, null, pdf('offer.pdf', 'Offer: 120k'));
  // someone who held the file's key encrypts other bytes of the same size for the same blob
  const fileKey = await itemKeyWrap.unwrap(folderKeys.get(folder.id), folder.id, item.id, item.keyWrap);
  const blob = state.blobs.get(item.blob.id);
  const aes = await blobCipher.key(fileKey, 'encrypt');
  blob.parts[0] = await blobCipher.seal(aes, blobCipher.prefix(b64u.decode(blob.header)), blob.id, 0, 1, text('Offer: 999k'));
  await as('w');
  const { folder: opened, items } = await folders.open(folder.id);
  await assert.rejects(fileDownload.read(opened, items[0]), /isn’t the one its uploader signed/);
});

test('taking someone out wraps every key anew, and the old folder key opens nothing after', async () => {
  const folder = await shared(['w', 'x']);
  const item = await folderFiles.upload(folder, null, pdf('plan.pdf', 'The plan'));
  const old = folderKeys.get(folder.id).slice();
  await folders.restrict(folder, ['w'], 'people');
  assert.deepEqual([...state.keys.get(folder.id).keys()].sort(), ['v', 'w']);
  await assert.rejects(itemKeyWrap.unwrap(old, folder.id, item.id, state.items.get(item.id).keyWrap));

  await as('w');
  const opened = await folders.open(folder.id);
  assert.equal(opened.folder.warning, null);
  assert.equal(await (await fileDownload.read(opened.folder, opened.items[0])).text(), 'The plan');
  await as('x');
  await assert.rejects(folders.open(folder.id));
});

test('renames and moves are signed again, and an older edit shows as a rollback', async () => {
  const folder = await shared();
  const item = await folderFiles.upload(folder, null, pdf('draft.pdf', 'v1'));
  const sub = await folderFiles.newFolder(folder, null, 'Final');
  const before = { ...state.items.get(item.id) };
  const renamed = await folderFiles.rename(folder, item, 'final.pdf');
  const moved = await folderFiles.move(folder, renamed, sub.id);
  assert.deepEqual([moved.name, moved.parentId, moved.edit], ['final.pdf', sub.id, 2]);

  await as('w');
  assert.equal(byName(await listed(folder.id), 'final.pdf').parentId, sub.id);
  state.items.set(item.id, before);
  const rolledBack = byName(await listed(folder.id), 'draft.pdf');
  assert.deepEqual([rolledBack.locked, rolledBack.rollback], [false, true]);
});

test('a folder whose name no teammate signed opens read-only, and nothing is written under its key', async () => {
  const folder = await shared();
  await folderFiles.upload(folder, null, pdf('real.pdf', 'real'));
  // the server makes a key of its own, seals it to Wen and signs a name with a key of its own
  const fake = crypto.getRandomValues(new Uint8Array(32));
  const signingPrivate = ed25519.utils.randomPrivateKey();
  const facts = folderFacts.list({ audience: 'people', readers: ['v', 'w'], key: keyHash(fake), at: Date.now() });
  const f = state.folders.get(folder.id);
  f.nameCt = await folderName.seal(fake, folder.id, f.version, signedFacts.seal('Send keys here', { kind: folderFacts.kind, place: folderFacts.place(folder.id, f.version), facts, by: 'v', signingPrivate }));
  state.keys.get(folder.id).set('w', await folderKeySeal.seal(fake, ids.w.publicKey));

  await as('w');
  const opened = await folders.open(folder.id);
  assert.equal(opened.folder.warning, 'unverified');
  assert.ok(opened.items.every((i) => i.locked), 'files under the real key don’t open under the fake one');
  await assert.rejects(folderFiles.upload(opened.folder, null, pdf('secret.pdf', 'secret')), /can’t confirm a teammate named this folder/);
  await assert.rejects(folders.share(opened.folder, ['x']), /can’t confirm a teammate named this folder/);
  assert.equal(state.items.size, 1);
});
