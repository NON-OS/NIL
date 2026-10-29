import blobHash from './blobHash';

const DIGEST = 32;

// A file's chunk list: the SHA-256 of each of its 1 MiB chunks before encryption, in order, kept
// as a small sealed blob of its own. It adds up to the content hash its uploader signed, so once
// it checks out, every chunk can be checked the moment it's decrypted instead of only at the end:
// a preview that streams, or a download written to disk, never takes in a chunk that isn't the
// uploader's.
const chunkHashes = {
  // The list, once it fits the file: one hash per chunk, adding up to the signed hash.
  check(list: Uint8Array, chunks: number, hash: string) {
    if (list.length !== DIGEST * chunks || blobHash.of(list) !== hash) throw new Error('This file’s list of pieces isn’t the one its uploader signed.');
    return {
      // whether chunk `index` hashes to `digest`
      fits: (index: number, digest: Uint8Array) => digest.length === DIGEST && digest.every((b, i) => b === list[index * DIGEST + i]),
    };
  },
};

export default chunkHashes;
