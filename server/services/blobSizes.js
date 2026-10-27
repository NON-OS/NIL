import config from '../config.js';

const { chunkBytes, tagBytes, maxFileBytes } = config.sealedBlobs;
const FULL = chunkBytes + tagBytes;

// The sizes a sealed blob's chunks must have. Every chunk but the last holds exactly chunkBytes
// of the file and its tag; the last holds what's left, from nothing (an empty file) up to a full
// chunk. So the whole size fixes how many chunks there are and how large each one is, and a
// browser can't announce one thing and send another.
const blobSizes = {
  // the most a blob may take, a file of SEALED_FILE_MAX_MB with every chunk's tag
  max: maxFileBytes + tagBytes * Math.ceil(maxFileBytes / chunkBytes),

  // how many chunks a blob of `size` bytes has, or 0 when no file encrypts to that size
  chunks(size) {
    const n = Math.ceil(size / FULL);
    return n >= 1 && size - (n - 1) * FULL >= tagBytes ? n : 0;
  },

  chunk: (blob, index) => (index < blob.chunks - 1 ? FULL : blob.size - (blob.chunks - 1) * FULL),
};

export default blobSizes;
