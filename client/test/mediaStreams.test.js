import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

// Video and sound that play as they arrive: the page answers the service worker's range requests
// from chunks it decrypts and checks one by one, and nothing that isn't the uploader's gets out.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const folders = await load('actions/folders');
const folderFiles = await load('actions/folderFiles');
const mediaStreams = await load('actions/mediaStreams');
const blobCipher = await load('lib/crypto/blobCipher');

const users = [{ id: 'v', name: 'Vic', role: 'owner' }, { id: 'w', name: 'Wen', role: 'member' }];
const ids = {};
let onMessage = null;
globalThis.navigator.serviceWorker = {
  controller: { postMessage: (msg, [port]) => port.postMessage('nil:stream-ready') },
  addEventListener: (type, fn) => (onMessage = fn),
  removeEventListener: () => (onMessage = null),
};

beforeEach(async () => {
  reset();
  for (const u of users) ids[u.id] = person();
  route('GET', '/api/encryption-keys', () => users.map((u) => entry(u.id, ids[u.id])));
  serveFiles(() => store.get().me.id);
  signIn('v', ids.v, users);
  await confirm(['w']);
});

// what the worker would get back for a range of a stream's bytes
const ask = (url, start, end = null) =>
  new Promise((resolve) => onMessage({ data: { type: 'nil:stream', token: url.split('/').pop(), start, end }, ports: [{ postMessage: resolve }] }));

function noise(size) {
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += 65536) crypto.getRandomValues(bytes.subarray(at, at + 65536));
  return bytes;
}

test('ranges come back exactly, across chunk edges, and past the end is refused', async () => {
  assert.equal(await mediaStreams.available(), true);
  const folder = await folders.create({ name: 'Talks', audience: 'people', people: ['w'] });
  const bytes = noise(blobCipher.CHUNK * 2 + 777);
  const item = await folderFiles.upload(folder, null, new File([bytes], 'talk.webm', { type: 'video/webm' }));
  assert.ok(mediaStreams.fits(item));
  const stream = await mediaStreams.open(folder, item);
  const edge = blobCipher.CHUNK - 5;
  const got = await ask(stream.url, edge, edge + 20);
  assert.deepEqual(got.bytes, bytes.subarray(edge, edge + 21));
  assert.equal(got.total, bytes.length);
  assert.equal(got.type, 'video/webm');
  // an open end gets at most what one answer carries
  const open = await ask(stream.url, 10);
  assert.equal(open.bytes.length, 2 * 1024 * 1024);
  assert.deepEqual(open.bytes, bytes.subarray(10, 10 + 2 * 1024 * 1024));
  const tail = await ask(stream.url, bytes.length - 3);
  assert.deepEqual(tail.bytes, bytes.subarray(bytes.length - 3));
  assert.deepEqual(await ask(stream.url, bytes.length), { status: 416, total: bytes.length });
  stream.close();
  assert.equal(onMessage, null, 'nothing listens once the last stream closes');
});

test('a chunk the server changed, or swapped for another file’s, never reaches the player', async () => {
  const folder = await folders.create({ name: 'Talks', audience: 'people', people: ['w'] });
  const bytes = noise(blobCipher.CHUNK * 3);
  const item = await folderFiles.upload(folder, null, new File([bytes], 'talk.webm', { type: 'video/webm' }));
  const stream = await mediaStreams.open(folder, item);
  const blob = state.blobs.get(state.items.get(item.id).blobId);
  blob.parts[1] = blob.parts[1].map((x, i) => (i === 40 ? x ^ 1 : x));
  assert.deepEqual(await ask(stream.url, blobCipher.CHUNK + 1, blobCipher.CHUNK + 9), { status: 502 });
  assert.deepEqual((await ask(stream.url, 0, 9)).bytes, bytes.subarray(0, 10), 'the parts that check out still play');
  stream.close();
  assert.deepEqual(await ask((await mediaStreams.open(folder, item)).url.replace(/[^/]+$/, 'x'.repeat(32)), 0), { status: 404 });
});

test('a file of several chunks from before chunk lists were signed doesn’t stream', async () => {
  const folder = await folders.create({ name: 'Talks', audience: 'people', people: ['w'] });
  const item = await folderFiles.upload(folder, null, new File([noise(blobCipher.CHUNK + 1)], 'old.webm', { type: 'video/webm' }));
  assert.equal(mediaStreams.fits({ ...item, hashes: null }), false);
  await assert.rejects(folderFiles.reader(folder, { ...item, hashes: null }), /before Nil signed each piece/);
});
