import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { utf8ToBytes } from '@noble/hashes/utils';
import { store, person, signIn, reset, sent, b64u } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const sealedBlobs = await load('actions/sealedBlobs');
const blobCipher = await load('lib/crypto/blobCipher');
const safeBlobType = await load('lib/safeBlobType');

const MB = 1024 * 1024;
const scope = { kind: 'doc', id: 'doc-1' };
const bytes = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);
const same = async (blob, expected) => assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), expected);

beforeEach(() => {
  reset();
  signIn('v', person(), [{ id: 'v', name: 'Vic' }]);
  serveFiles(() => store.get().me.id);
});

test('a file goes up in 1 MiB chunks and comes back whole, empty files included', async () => {
  for (const size of [0, 1, MB - 1, MB, MB + 1, 2.5 * MB]) {
    const file = bytes(size);
    const progress = [];
    const ref = await sealedBlobs.upload(new Blob([file], { type: 'application/zip' }), { scope, name: 'a.zip', onProgress: (p) => progress.push(p) });
    const blob = state.blobs.get(ref.blob);
    assert.equal(blob.chunks, blobCipher.chunks(size));
    assert.equal(blob.size, size + 16 * blob.chunks);
    assert.ok(blob.parts.slice(0, -1).every((p) => p.length === MB + 16), 'every chunk but the last is full');
    assert.deepEqual([ref.mime, ref.name, ref.size], ['application/zip', 'a.zip', size]);
    assert.equal(progress.at(-1), 1);
    assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'progress only goes forward');
    await same(await sealedBlobs.read(ref), file);
  }
});

test('the key never reaches the server', async () => {
  const ref = await sealedBlobs.upload(new Blob([bytes(1000)]), { scope, name: 'x.bin' });
  assert.equal(b64u.decode(ref.key).length, 32);
  const everything = JSON.stringify(sent.map((s) => (s.body instanceof Uint8Array ? b64u.encode(s.body) : s.body)));
  assert.equal(everything.includes(ref.key), false);
});

test('chunks follow the documented format: prefix, counter and flag in the nonce, place in the data', async () => {
  const ref = await sealedBlobs.upload(new Blob([bytes(MB + 5)]), { scope });
  const blob = state.blobs.get(ref.blob);
  const header = b64u.decode(blob.header);
  assert.equal(header[0], 1);
  const key = await crypto.subtle.importKey('raw', b64u.decode(ref.key), 'AES-GCM', false, ['decrypt']);
  for (const [index, last] of [[0, 0], [1, 1]]) {
    const iv = new Uint8Array(12);
    iv.set(header.subarray(1));
    new DataView(iv.buffer).setUint32(7, index);
    iv[11] = last;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8ToBytes(`nil/blob/${ref.blob}/${index}/${last}`) }, key, blob.parts[index]);
    assert.equal(plain.byteLength, index ? 5 : MB);
  }
});

test('a changed, reordered, cut-off, lengthened or swapped chunk fails the whole read', async () => {
  const file = bytes(3 * MB + 100);
  const ref = await sealedBlobs.upload(new Blob([file]), { scope });
  const blob = state.blobs.get(ref.blob);
  const original = blob.parts.map((p) => p.slice());
  const header = blob.header;
  const restore = () => {
    blob.parts = original.map((p) => p.slice());
    Object.assign(blob, { chunks: 4, size: 3 * MB + 100 + 64, header });
  };
  const fails = async (what) => {
    await assert.rejects(sealedBlobs.read(ref), /couldn’t be decrypted/, what);
    restore();
  };

  blob.parts[1][100] ^= 1;
  await fails('a flipped bit');
  [blob.parts[0], blob.parts[1]] = [original[1], original[0]];
  await fails('two chunks swapped');
  Object.assign(blob, { chunks: 3, size: 3 * (MB + 16) });
  blob.parts.pop();
  await fails('the last chunk cut off, so the one before stands as the last');
  blob.parts[2] = original[3];
  blob.parts.length = 3;
  Object.assign(blob, { chunks: 3, size: 2 * (MB + 16) + original[3].length });
  await fails('a middle chunk left out');
  blob.parts.push(original[3]);
  Object.assign(blob, { chunks: 5, size: blob.size + original[3].length });
  await fails('the last chunk sent twice');
  blob.header = b64u.encode(Uint8Array.from([1, ...crypto.getRandomValues(new Uint8Array(7))]));
  await fails('another nonce prefix');
  blob.header = b64u.encode(Uint8Array.from([2, ...b64u.decode(blob.header).subarray(1)]));
  await assert.rejects(sealedBlobs.read(ref), /format Nil doesn’t know/);
  restore();

  // a chunk from another blob under the same key still names the other blob, so it's refused
  const key = await blobCipher.key(b64u.decode(ref.key), 'encrypt');
  const prefix = blobCipher.prefix(b64u.decode(blob.header));
  blob.parts[0] = await blobCipher.seal(key, prefix, 'some-other-blob', 0, 4, file.subarray(0, MB));
  await fails('a chunk sealed for another blob');
  await same(await sealedBlobs.read(ref), file);
});

test('photos are drawn again before they’re encrypted, so their hidden details stay behind', async () => {
  const drawn = [];
  globalThis.createImageBitmap = async () => ({ width: 4032, height: 3024, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      Object.assign(this, { w, h });
    }
    getContext() {
      return { drawImage: (...args) => drawn.push(args.slice(1)) };
    }
    async convertToBlob({ type }) {
      return new Blob([`pixels ${this.w}x${this.h}`], { type: type === 'image/webp' ? 'image/png' : type });
    }
  };
  try {
    const photo = new Blob(['\xff\xd8 Exif GPS 59.3293N 18.0686E'], { type: 'image/jpeg' });
    const ref = await sealedBlobs.upload(photo, { scope, name: 'IMG_0001.JPG' });
    assert.deepEqual([ref.mime, ref.width, ref.height], ['image/jpeg', 4032, 3024]);
    assert.equal(await (await sealedBlobs.read(ref)).text(), 'pixels 4032x3024');
    // a browser that can't write WebP hands back PNG, and the name says so
    const webp = await sealedBlobs.upload(new Blob(['RIFF'], { type: 'image/webp' }), { scope, name: 'sticker.webp' });
    assert.deepEqual([webp.mime, webp.name], ['image/png', 'sticker.png']);
    // a pasted photo with no type is known by its first bytes, and cleaned all the same
    const pasted = await sealedBlobs.upload(new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xe1, 0x45, 0x78, 0x69, 0x66)]), { scope, name: 'image' });
    assert.deepEqual([pasted.mime, pasted.name, pasted.width], ['image/jpeg', 'image.jpg', 4032]);
    assert.equal(await (await sealedBlobs.read(pasted)).text(), 'pixels 4032x3024');
    // SVG is never treated as an image
    const svg = await sealedBlobs.upload(new Blob(['<svg onload="alert(1)"/>'], { type: 'image/svg+xml' }), { scope, name: 'logo.svg' });
    assert.deepEqual([svg.mime, svg.width], ['image/svg+xml', undefined]);
    assert.equal((await sealedBlobs.read(svg)).type, 'application/octet-stream');
    assert.equal(drawn.length, 3);

    // an image that can't be read is refused, never sent as it is
    globalThis.createImageBitmap = async () => {
      throw new Error('broken');
    };
    const before = state.blobs.size;
    await assert.rejects(sealedBlobs.upload(photo, { scope, name: 'broken.jpg' }), /couldn’t read this image/);
    assert.equal(state.blobs.size, before);
  } finally {
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
  }
});

test('a stopped upload is deleted on the server', async () => {
  const stop = new AbortController();
  const upload = sealedBlobs.upload(new Blob([bytes(3 * MB)]), { scope, signal: stop.signal, onProgress: (p) => p > 0.3 && stop.abort() });
  await assert.rejects(upload, { name: 'AbortError' });
  assert.equal(state.blobs.size, 0);
  assert.ok(sent.some((s) => s.method === 'DELETE' && s.url.startsWith('/api/blobs/')));
});

test('decrypted files only keep types a browser shows without running anything', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/javascript', 'text/markdown', 'TEXT/HTML; charset=utf-8']) assert.equal(safeBlobType(type), 'application/octet-stream', type);
  for (const type of ['image/png', 'application/pdf', 'video/mp4', 'audio/mpeg', 'text/plain']) assert.equal(safeBlobType(type), type);
});
