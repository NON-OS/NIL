import http from '../api/http';
import putChunk from '../api/putChunk';
import blobCipher from '../lib/crypto/blobCipher';
import b64u from '../lib/crypto/b64u';
import type BlobInfo from '../types/BlobInfo';
import type BlobScope from '../types/BlobScope';
import type BlobProgress from '../types/BlobProgress';

// chunks fetched ahead of the one being decrypted, so the network and the decryption overlap
const AHEAD = 3;
const CHANGED = 'This file couldn’t be decrypted. It may have been changed on the server.';

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
  // Encrypts `file` under `key` and uploads it into `scope`. Returns the new blob's id. A stopped
  // or failed upload is deleted on the server rather than left for the sweep. `onPlain` sees each
  // chunk before it's encrypted, for a content hash made in the same pass.
  async put(file: Blob, key: Uint8Array, scope: BlobScope, { onProgress, signal, onPlain }: BlobProgress & { onPlain?: (plain: Uint8Array) => Promise<void> } = {}) {
    const count = blobCipher.chunks(file.size);
    const total = blobCipher.sealedSize(file.size);
    const header = blobCipher.header();
    const prefix = blobCipher.prefix(header);
    const aes = await blobCipher.key(key, 'encrypt');
    signal?.throwIfAborted();
    const { blob } = await http.post<{ blob: string }>('/blobs', { scope, size: total, chunks: count, header: b64u.encode(header) });
    try {
      let done = 0;
      onProgress?.(0);
      for (let i = 0; i < count; i++) {
        signal?.throwIfAborted();
        const plain = new Uint8Array(await file.slice(i * blobCipher.CHUNK, (i + 1) * blobCipher.CHUNK).arrayBuffer());
        await onPlain?.(plain);
        const sealed = await blobCipher.seal(aes, prefix, blob, i, count, plain);
        await putChunk(`/blobs/${blob}/chunks/${i}`, sealed, { signal, onSent: (bytes) => onProgress?.((done + bytes) / total) });
        done += sealed.length;
        onProgress?.(done / total);
      }
      signal?.throwIfAborted();
      await http.post(`/blobs/${blob}/finish`);
      return blob;
    } catch (err) {
      http.del(`/blobs/${blob}`).catch(() => {});
      throw err;
    }
  },

  async info(id: string, signal?: AbortSignal) {
    const info = await http.get<BlobInfo>(`/blobs/${encodeURIComponent(id)}`);
    signal?.throwIfAborted();
    checkInfo(info, id);
    return info;
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
        const fetched = http.bytes(`/blobs/${encodeURIComponent(info.id)}/chunks/${next++}`, signal);
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
