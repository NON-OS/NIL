import http from '../api/http';
import putChunk from '../api/putChunk';
import blobCipher from '../lib/crypto/blobCipher';
import b64u from '../lib/crypto/b64u';
import type BlobInfo from '../types/BlobInfo';
import type BlobScope from '../types/BlobScope';
import type BlobProgress from '../types/BlobProgress';
import type BlobCarry from '../types/BlobCarry';

// chunks fetched ahead of the one being decrypted, so the network and the decryption overlap
const AHEAD = 3;
const CHANGED = 'This file couldn’t be decrypted. It may have been changed on the server.';
const MOVED = 'The file changed on this computer since the upload started. Try again to upload it from the beginning.';
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

// The upload a carry names, if the server still has it open with the same shape, and the chunks
// it has.
async function carriedOn(carry: BlobCarry | undefined, total: number, count: number) {
  if (!carry?.blob || !carry.header) return null;
  try {
    const at = await http.get<{ blob: BlobInfo; received: number[] }>(`/blobs/${encodeURIComponent(carry.blob)}/upload`);
    if (at.blob.size === total && at.blob.chunks === count) return { blob: carry.blob, header: carry.header, received: new Set(at.received) };
  } catch {}
  return null;
}

// The header's nonce prefix, once the server's description of the blob fits the format: as many
// chunks as its size makes, and a last chunk that holds at least its tag.
function checkInfo(info: BlobInfo, id: string) {
  let fits = false;
  try {
    fits = info?.id === id && Number.isSafeInteger(info.size) && info.chunks === Math.ceil(info.size / (blobCipher.CHUNK + blobCipher.TAG)) && blobCipher.chunkSize(info.chunks - 1, info.chunks, info.size) >= blobCipher.TAG;
  } catch {
    fits = false;
  }
  if (!fits) throw new Error(CHANGED);
  return blobCipher.prefix(b64u.decode(info.header));
}

// Moves sealed blobs between this tab and the server, one chunk at a time: encrypting each
// chunk just before it goes up, decrypting each as it comes down. Keys never leave the tab.
const blobTransfer = {
  // Encrypts `file` under `key` and uploads it into `scope`. Returns the new blob's id. `onPlain`
  // sees each chunk before it's encrypted, for a content hash made in the same pass. `part` marks
  // a file's thumbnail or chunk list, and `replaces` names the blob a fresh copy stands in for.
  // A stopped upload is deleted on the server. One that failed is too, unless it has a `carry`:
  // then it's kept, and passing the same carry again carries on from the chunks already there.
  async put(file: Blob, key: Uint8Array, scope: BlobScope, { onProgress, signal, onPlain, part, replaces, carry }: BlobProgress & { onPlain?: (plain: Uint8Array) => Promise<unknown>; part?: 'thumb' | 'hashes'; replaces?: string; carry?: BlobCarry } = {}) {
    const count = blobCipher.chunks(file.size);
    const total = blobCipher.sealedSize(file.size);
    const aes = await blobCipher.key(key, 'encrypt');
    signal?.throwIfAborted();
    const kept = await carriedOn(carry, total, count);
    const header = kept?.header ?? blobCipher.header();
    const prefix = blobCipher.prefix(header);
    const received = kept?.received ?? new Set<number>();
    const blob = kept?.blob ?? (await http.post<{ blob: string }>('/blobs', { scope, size: total, chunks: count, header: b64u.encode(header), ...(part ? { part } : {}), ...(replaces ? { replaces } : {}) })).blob;
    if (carry && !kept) Object.assign(carry, { blob, header, digests: [] });
    try {
      let done = 0;
      onProgress?.(0);
      for (let i = 0; i < count; i++) {
        signal?.throwIfAborted();
        const plain = new Uint8Array(await file.slice(i * blobCipher.CHUNK, (i + 1) * blobCipher.CHUNK).arrayBuffer());
        await onPlain?.(plain);
        if (carry) {
          // a chunk sealed before has to read exactly as it did, or its nonce would be used twice
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plain));
          if (carry.digests[i] && !same(carry.digests[i], digest)) throw new Error(MOVED);
          carry.digests[i] = digest;
        }
        const size = blobCipher.chunkSize(i, count, total);
        if (!received.has(i)) await putChunk(`/blobs/${blob}/chunks/${i}`, await blobCipher.seal(aes, prefix, blob, i, count, plain), { signal, onSent: (bytes) => onProgress?.((done + bytes) / total) });
        done += size;
        onProgress?.(done / total);
      }
      signal?.throwIfAborted();
      await http.post(`/blobs/${blob}/finish`);
      if (carry) Object.assign(carry, { blob: undefined, header: undefined, digests: [] });
      return blob;
    } catch (err) {
      if (!carry || signal?.aborted || (err instanceof Error && err.message === MOVED)) {
        http.del(`/blobs/${blob}`).catch(() => {});
        if (carry) Object.assign(carry, { blob: undefined, header: undefined, digests: [] });
      }
      throw err;
    }
  },

  // Encrypts a blob again under a fresh key without it ever being whole in memory: each chunk is
  // fetched, opened under `from`, handed to `onPlain` (to check it), sealed under `to` and sent,
  // one at a time. The copy names the blob it `replaces`. Returns the copy's id.
  async copy(info: BlobInfo, from: Uint8Array, to: Uint8Array, scope: BlobScope, { replaces, signal, onPlain }: { replaces: string; signal?: AbortSignal; onPlain?: (plain: Uint8Array, index: number) => Promise<unknown> }) {
    const oldPrefix = checkInfo(info, info.id);
    const opener = await blobCipher.key(from, 'decrypt');
    const header = blobCipher.header();
    const prefix = blobCipher.prefix(header);
    const sealer = await blobCipher.key(to, 'encrypt');
    const { blob } = await http.post<{ blob: string }>('/blobs', { scope, size: info.size, chunks: info.chunks, header: b64u.encode(header), replaces });
    try {
      for (let i = 0; i < info.chunks; i++) {
        signal?.throwIfAborted();
        const sealed = await http.bytes(`/blobs/${encodeURIComponent(info.id)}/chunks/${i}`, signal, blobCipher.chunkSize(i, info.chunks, info.size));
        if (sealed.length !== blobCipher.chunkSize(i, info.chunks, info.size)) throw new Error(CHANGED);
        const plain = await blobCipher.open(opener, oldPrefix, info.id, i, info.chunks, sealed).catch(() => {
          throw new Error(CHANGED);
        });
        await onPlain?.(plain, i);
        await putChunk(`/blobs/${blob}/chunks/${i}`, await blobCipher.seal(sealer, prefix, blob, i, info.chunks, plain), { signal });
      }
      return blob;
    } catch (err) {
      http.del(`/blobs/${blob}`).catch(() => {});
      throw err;
    }
  },

  // Seals a copy started with `copy` once its content has checked out.
  finish: (blob: string) => http.post(`/blobs/${blob}/finish`),

  async info(id: string, signal?: AbortSignal) {
    const info = await http.get<BlobInfo>(`/blobs/${encodeURIComponent(id)}`);
    signal?.throwIfAborted();
    checkInfo(info, id);
    return info;
  },

  // Chunks one at a time in any order, for a player that skips around: each fetched and decrypted
  // on its own, checked against its place and size like any other.
  async opener(info: BlobInfo, key: Uint8Array) {
    const prefix = checkInfo(info, info.id);
    const aes = await blobCipher.key(key, 'decrypt').catch(() => {
      throw new Error(CHANGED);
    });
    return async (i: number, signal?: AbortSignal) => {
      const size = blobCipher.chunkSize(i, info.chunks, info.size);
      const sealed = await http.bytes(`/blobs/${encodeURIComponent(info.id)}/chunks/${i}`, signal, size);
      if (sealed.length !== size) throw new Error(CHANGED);
      return blobCipher.open(aes, prefix, info.id, i, info.chunks, sealed).catch(() => {
        throw new Error(CHANGED);
      });
    };
  },

  // Fetches and decrypts every chunk of a blob in order, handing each one's plain bytes to
  // `sink` before the next is decrypted. Any chunk that doesn't open, or has the wrong size,
  // stops it: nothing after a chunk that fails is ever handed on.
  async each(info: BlobInfo, key: Uint8Array, sink: (plain: Uint8Array) => void | Promise<void>, { onProgress, signal }: BlobProgress = {}) {
    const prefix = checkInfo(info, info.id);
    const aes = await blobCipher.key(key, 'decrypt').catch(() => {
      throw new Error(CHANGED);
    });
    const ahead: Promise<Uint8Array>[] = [];
    let next = 0;
    let done = 0;
    onProgress?.(0);
    for (let i = 0; i < info.chunks; i++) {
      while (next < info.chunks && ahead.length < AHEAD) {
        const fetched = http.bytes(`/blobs/${encodeURIComponent(info.id)}/chunks/${next}`, signal, blobCipher.chunkSize(next, info.chunks, info.size));
        next++;
        fetched.catch(() => {});
        ahead.push(fetched);
      }
      const sealed = await ahead.shift()!;
      if (sealed.length !== blobCipher.chunkSize(i, info.chunks, info.size)) throw new Error(CHANGED);
      const plain = await blobCipher.open(aes, prefix, info.id, i, info.chunks, sealed).catch(() => {
        throw new Error(CHANGED);
      });
      await sink(plain);
      done += sealed.length;
      onProgress?.(done / info.size);
    }
  },
};

export default blobTransfer;
