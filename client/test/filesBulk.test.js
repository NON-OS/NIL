import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { store, entry, person, signIn, route, reset, confirm, sent } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

// Doing things to several files at once: moving and trashing them together, downloading files and
// whole folders as one zip, uploading a folder from the computer with what's inside it, and an
// upload that carries on after a failure instead of starting over.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const folders = await load('actions/folders');
const folderFiles = await load('actions/folderFiles');
const zipDownload = await load('actions/zipDownload');
const uploadTree = await load('actions/uploadTree');
const uploadQueue = await load('actions/uploadQueue');
const blobTransfer = await load('actions/blobTransfer');
const zipWriter = await load('lib/zipWriter');
const zipPaths = await load('lib/zipPaths');
const droppedFiles = await load('lib/droppedFiles');
const blobCipher = await load('lib/crypto/blobCipher');

const users = [{ id: 'v', name: 'Vic', role: 'owner' }, { id: 'w', name: 'Wen', role: 'member' }];
const ids = {};
const text = (name, body) => new File([body], name, { type: 'text/plain' });

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

// what a zip handed to the downloads holds, by name
async function saved(run) {
  const original = URL.createObjectURL;
  let blob = null;
  URL.createObjectURL = (b) => ((blob = b), 'blob:zip');
  try {
    await run();
  } finally {
    URL.createObjectURL = original;
  }
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  const out = {};
  for (const [name, file] of Object.entries(zip.files)) out[name] = file.dir ? '/' : await file.async('string');
  return out;
}

test('a zip written as it goes opens in another zip reader, past the 4 GB fields too', async () => {
  for (const zip64At of [0xffffffff, 10]) {
    const parts = [];
    const zip = zipWriter((b) => void parts.push(b), { zip64At });
    await zip.file('notes/ünïcode.txt', 11, async (put) => {
      await put(new TextEncoder().encode('hello '));
      await put(new TextEncoder().encode('world'));
    });
    await zip.folder('empty/');
    await zip.file('two.txt', 3, (put) => put(new TextEncoder().encode('abc')));
    await zip.end();
    const read = await JSZip.loadAsync(new Blob(parts).arrayBuffer());
    assert.equal(await read.file('notes/ünïcode.txt').async('string'), 'hello world', `zip64 from ${zip64At}`);
    assert.equal(await read.file('two.txt').async('string'), 'abc');
    assert.ok(read.files['empty/'].dir);
  }
  const zip = zipWriter(() => {});
  await assert.rejects(zip.file('short.txt', 5, (put) => put(new Uint8Array(3))), /different size/);
});

test('names in a zip can’t reach outside the folder it’s unpacked into', () => {
  const item = (id, name, kind = 'file', parentId = null, extra = {}) => ({ id, name, kind, parentId, size: 1, locked: false, ...extra });
  const all = [
    item('a', '../../etc/passwd'),
    item('b', 'report.pdf'),
    item('c', 'REPORT.pdf'),
    item('d', 'Sub', 'folder'),
    item('e', 'a/b\\c:d.txt', 'file', 'd'),
    item('f', 'Empty', 'folder'),
    item('g', 'invoice‮txt.exe'),
    item('h', '..'),
    item('i', 'Locked', 'file', null, { locked: true }),
  ];
  const { entries, locked } = zipPaths(all.filter((i) => !i.parentId), all);
  assert.deepEqual(
    entries.map((e) => e.path),
    ['.._.._etc_passwd', 'report.pdf', 'REPORT (2).pdf', 'Sub/a_b_c_d.txt', 'Empty/', 'invoicetxt.exe', 'Untitled'],
  );
  assert.equal(locked, 1);
});

test('several files and a folder go into one zip, each checked as it’s decrypted', async () => {
  const folder = await folders.create({ name: 'Plans', audience: 'people', people: ['w'] });
  const sub = await folderFiles.newFolder(folder, null, 'Drafts');
  const a = await folderFiles.upload(folder, null, text('a.txt', 'first'));
  await folderFiles.upload(folder, sub.id, text('b.txt', 'second'));
  await folderFiles.newFolder(folder, sub.id, 'Nothing yet');
  const { items } = await folders.open(folder.id);
  const got = await saved(() => zipDownload.save(folder, items.filter((i) => !i.parentId), items, 'Plans.zip'));
  assert.deepEqual(got, { 'Drafts/b.txt': 'second', 'Drafts/Nothing yet/': '/', 'a.txt': 'first' });

  // a file the server changed stops the zip rather than end up in it
  const blob = state.blobs.get(state.items.get(a.id).blobId);
  blob.parts[0] = blob.parts[0].map((x, i) => (i === 20 ? x ^ 1 : x));
  await assert.rejects(zipDownload.save(folder, items.filter((i) => !i.parentId), items, 'Plans.zip'), /a\.txt:.*The zip was stopped/);
});

test('several items move together, each signed again, and go to the trash together', async () => {
  const folder = await folders.create({ name: 'Plans', audience: 'people', people: ['w'] });
  const into = await folderFiles.newFolder(folder, null, 'Archive');
  const one = await folderFiles.upload(folder, null, text('one.txt', '1'));
  const two = await folderFiles.upload(folder, null, text('two.txt', '2'));
  const moved = await folderFiles.moveMany(folder, [one, two], into.id);
  assert.deepEqual(moved.map((i) => [i.name, i.parentId, i.by]), [['one.txt', into.id, 'v'], ['two.txt', into.id, 'v']]);

  // Wen sees them where they went, signed by Vic, not wherever the server says
  await as('w');
  const seen = await folders.open(folder.id);
  assert.deepEqual(seen.items.filter((i) => i.parentId === into.id).map((i) => i.name).sort(), ['one.txt', 'two.txt']);
  await as('v');
  await folderFiles.removeMany(folder, [one, two]);
  const after = await folders.open(folder.id);
  assert.deepEqual(after.trash.map((i) => i.name).sort(), ['one.txt', 'two.txt']);
  // a server that shows one somewhere other than where it was signed is caught
  state.items.get(one.id).parentId = null;
  assert.ok((await folders.open(folder.id)).trash.find((i) => i.id === one.id).locked);
});

test('a dropped folder is made with its subfolders before its files go into them', async () => {
  const folder = await folders.create({ name: 'Plans', audience: 'people', people: ['w'] });
  // what a browser hands over for a dropped folder: entries read a batch at a time
  const fileEntry = (file) => ({ isFile: true, name: file.name, file: (ok) => ok(file) });
  const dirEntry = (name, children) => ({
    isFile: false,
    name,
    createReader: () => {
      let given = false;
      return { readEntries: (ok) => ok(given ? [] : ((given = true), children)) };
    },
  });
  const top = dirEntry('Trip', [fileEntry(text('plan.txt', 'go')), dirEntry('Photos', [fileEntry(text('a.txt', 'pic'))]), dirEntry('Empty', [])]);
  const data = { items: [{ kind: 'file', webkitGetAsEntry: () => top }, { kind: 'file', webkitGetAsEntry: () => fileEntry(text('loose.txt', 'x')) }], files: [] };
  const dropped = await droppedFiles(data, 100);
  assert.deepEqual(dropped.map((d) => [d.path.join('/'), d.file?.name ?? null]), [['Trip', 'plan.txt'], ['Trip/Photos', 'a.txt'], ['Trip/Empty', null], ['', 'loose.txt']]);
  await assert.rejects(droppedFiles(data, 2), /more than the 2/);

  const put = [];
  await uploadTree(folder, dropped, { parentId: null, depth: 0, held: 0, maxFile: 0, put: (i) => put.push(i) });
  for (let tries = 0; uploadQueue.snapshot().some((j) => j.status === 'queued' || j.status === 'uploading') && tries < 200; tries++) await new Promise((r) => setTimeout(r, 10));
  const { items } = await folders.open(folder.id);
  const named = (name) => items.find((i) => i.name === name);
  assert.equal(named('Photos').parentId, named('Trip').id);
  assert.equal(named('Empty').parentId, named('Trip').id);
  assert.equal(named('a.txt').parentId, named('Photos').id);
  assert.equal(named('plan.txt').parentId, named('Trip').id);
  assert.equal(named('loose.txt').parentId, null);
  uploadQueue.clear();

  // too deep or too many is refused before anything is made
  const before = state.items.size;
  store.set({ files: { ...store.get().files, depthMax: 1 } });
  await assert.rejects(uploadTree(folder, dropped, { parentId: null, depth: 0, held: 0, maxFile: 0, put() {} }), /nest deeper/);
  store.set({ files: { ...store.get().files, depthMax: 32, folderItemsMax: 5 } });
  await assert.rejects(uploadTree(folder, dropped, { parentId: null, depth: 0, held: 0, maxFile: 0, put() {} }), /more than this shared folder has room for/);
  assert.equal(state.items.size, before);
});

test('an upload that failed carries on from the chunks the server has, and starts over if the file changed', async () => {
  const size = blobCipher.CHUNK * 3 + 10;
  const bytes = new Uint8Array(size);
  for (let at = 0; at < size; at += 65536) crypto.getRandomValues(bytes.subarray(at, at + 65536));
  const key = crypto.getRandomValues(new Uint8Array(32));
  const scope = { kind: 'folder', id: 'f' };
  const carry = { digests: [] };
  // the third chunk fails once, the way a server that turned it away would
  const real = globalThis.fetch;
  let failed = false;
  globalThis.fetch = (url, opts) => (!failed && opts?.method === 'PUT' && /\/chunks\/2$/.test(url) ? ((failed = true), Promise.resolve(new Response('{"error":"Nope"}', { status: 500 }))) : real(url, opts));
  await assert.rejects(blobTransfer.put(new Blob([bytes]), key, scope, { carry }), /Nope/);
  globalThis.fetch = real;
  assert.ok(carry.blob && state.blobs.has(carry.blob), 'what was sent is kept for another try');

  const before = sent.length;
  const blob = await blobTransfer.put(new Blob([bytes]), key, scope, { carry });
  const puts = sent.slice(before).filter((r) => r.method === 'PUT').map((r) => Number(r.url.split('/').pop()));
  assert.deepEqual(puts, [2, 3], 'only the chunks the server didn’t have go again');
  const back = [];
  await blobTransfer.each(await blobTransfer.info(blob), key, (plain) => void back.push(plain));
  assert.deepEqual(new Uint8Array(await new Blob(back).arrayBuffer()), bytes);
  assert.equal(carry.blob, undefined);

  // the same file changed on disk between tries: nothing is sealed again under the same nonce
  const again = { digests: [] };
  globalThis.fetch = (url, opts) => (opts?.method === 'PUT' && /\/chunks\/1$/.test(url) ? Promise.resolve(new Response('{"error":"Nope"}', { status: 500 })) : real(url, opts));
  await assert.rejects(blobTransfer.put(new Blob([bytes]), key, scope, { carry: again }), /Nope/);
  globalThis.fetch = real;
  const kept = again.blob;
  const changed = bytes.slice();
  changed[5] ^= 1;
  await assert.rejects(blobTransfer.put(new Blob([changed]), key, scope, { carry: again }), /changed on this computer/);
  assert.ok(!state.blobs.has(kept), 'the half-sent upload is deleted');
  assert.equal(again.blob, undefined);
});
