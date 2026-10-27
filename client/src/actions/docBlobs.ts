import sealedBlobs from './sealedBlobs';
import type SealedImageAttrs from '../lib/docConvert/SealedImageAttrs';
import type BlobProgress from '../types/BlobProgress';

// Images and files inside a doc: encrypted in this tab and stored with the doc, so only people
// holding the doc's key can fetch them, and the key to each lives in the doc's own text.
const docBlobs = {
  upload: (docId: string, file: Blob, { name, ...progress }: { name?: string } & BlobProgress = {}) => sealedBlobs.upload(file, { scope: { kind: 'doc', id: docId }, name, ...progress }),

  read: (attrs: { blob: string; key: string; mime: string }, progress: BlobProgress = {}) => sealedBlobs.read(attrs, progress),

  // an image's bytes and size, for the Word and Markdown exports
  async image(attrs: SealedImageAttrs) {
    const blob = await sealedBlobs.read(attrs);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || attrs.mime, width: attrs.width ?? 0, height: attrs.height ?? 0 };
  },
};

export default docBlobs;
