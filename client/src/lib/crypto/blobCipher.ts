import { utf8ToBytes } from '@noble/hashes/utils';

// Sealed blobs are files encrypted in chunks, STREAM style, so a file of any size is read,
// encrypted and sent one chunk at a time and never sits whole in memory. Each chunk is
// AES-256-GCM under the blob's own key. Its nonce is the blob's random 7-byte prefix, the chunk
// number as 4 bytes big-endian and a last-chunk flag byte; its additional data names the blob,
// the chunk number and the flag. A chunk can't be moved to another place or another blob, and
// cutting chunks off the end leaves a final chunk that wasn't sealed as the last, which fails.
// docs/encryption.md has the format byte by byte.
//
// 1 MiB chunks: WebCrypto's AES-GCM takes a whole message at once, so a chunk is what has to fit
// in memory, twice over while it's encrypted, which a phone manages easily. And it's large
// enough that a 2 GiB file is 2048 requests and the tags add 0.0015%.
const CHUNK = 1024 * 1024;
const TAG = 16;
const VERSION = 1;
const HEADER = 8;
const MAX_CHUNKS = 2 ** 32;

function nonce(prefix: Uint8Array, index: number, last: boolean) {
  const out = new Uint8Array(12);
  out.set(prefix);
  new DataView(out.buffer).setUint32(7, index, false);
  out[11] = last ? 1 : 0;
  return out;
}

const aad = (blobId: string, index: number, last: boolean) => utf8ToBytes(`nil/blob/${blobId}/${index}/${last ? 1 : 0}`);

function place(index: number, count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_CHUNKS || !Number.isSafeInteger(index) || index < 0 || index >= count) throw new Error('That chunk isn’t part of the file.');
  return index === count - 1;
}

const blobCipher = {
  CHUNK,
  TAG,
  // a file of `size` bytes takes this many chunks; an empty file is one empty chunk
  chunks: (size: number) => Math.max(1, Math.ceil(size / CHUNK)),
  sealedSize: (size: number) => size + TAG * blobCipher.chunks(size),

  // what one sealed chunk of a blob of `sealedSize` bytes in `count` chunks has to measure
  chunkSize(index: number, count: number, sealedSize: number) {
    return place(index, count) ? sealedSize - (count - 1) * (CHUNK + TAG) : CHUNK + TAG;
  },

  // A fresh header: the format version, then the blob's random nonce prefix.
  header() {
    const out = new Uint8Array(HEADER);
    out[0] = VERSION;
    crypto.getRandomValues(out.subarray(1));
    return out;
  },

  prefix(header: Uint8Array) {
    if (header.length !== HEADER || header[0] !== VERSION) throw new Error('This file was encrypted in a format Nil doesn’t know.');
    return header.slice(1);
  },

  // imported once per blob rather than once per chunk
  key: (raw: Uint8Array, usage: KeyUsage) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]),

  async seal(key: CryptoKey, prefix: Uint8Array, blobId: string, index: number, count: number, plain: Uint8Array) {
    const last = place(index, count);
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce(prefix, index, last), additionalData: aad(blobId, index, last) }, key, plain));
  },

  async open(key: CryptoKey, prefix: Uint8Array, blobId: string, index: number, count: number, sealed: Uint8Array) {
    const last = place(index, count);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(prefix, index, last), additionalData: aad(blobId, index, last) }, key, sealed));
  },
};

export default blobCipher;
