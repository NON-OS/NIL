import http from '../api/http';
import blobTransfer from './blobTransfer';
import b64u from '../lib/crypto/b64u';
import cleanFile from '../lib/cleanFile';
import safeBlobType from '../lib/safeBlobType';
import type BlobScope from '../types/BlobScope';
import type BlobProgress from '../types/BlobProgress';
import type SealedBlobRef from '../types/SealedBlobRef';

// The sealed blob store: files encrypted in this tab, in chunks, under a fresh key for each, and
// stored on the server in a doc or a shared folder. What comes back is everything it takes to
// open the file again; the key in it never goes to the server, so keep it wherever the file is
// used, inside the doc or the folder's sealed details. Photos lose their hidden details (EXIF,
// GPS and the rest) before they're encrypted. SVG is a plain file like any other, never an image.
const sealedBlobs = {
  async upload(file: Blob, { scope, name, onProgress, signal }: { scope: BlobScope; name?: string } & BlobProgress): Promise<SealedBlobRef> {
    const clean = await cleanFile(file, name);
    const key = crypto.getRandomValues(new Uint8Array(32));
    try {
      const blob = await blobTransfer.put(clean.body, key, scope, { onProgress, signal });
      const ref: SealedBlobRef = { blob, key: b64u.encode(key), mime: clean.mime, name: clean.name, size: clean.body.size };
      return clean.width && clean.height ? { ...ref, width: clean.width, height: clean.height } : ref;
    } finally {
      key.fill(0);
    }
  },

  // The file, decrypted and checked chunk by chunk. A chunk that was changed, moved or left out
  // fails the whole read; nothing partial comes back.
  async read(ref: { blob: string; key: string; mime: string }, { onProgress, signal }: BlobProgress = {}): Promise<Blob> {
    const info = await blobTransfer.info(ref.blob, signal);
    const parts: Uint8Array[] = [];
    await blobTransfer.each(info, b64u.decode(ref.key), (plain) => void parts.push(plain), { onProgress, signal });
    return new Blob(parts, { type: safeBlobType(ref.mime) });
  },

  async remove(blobId: string): Promise<void> {
    await http.del(`/blobs/${encodeURIComponent(blobId)}`);
  },
};

export default sealedBlobs;
