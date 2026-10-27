import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import b64u from './b64u';

// A file's content hash, built a chunk at a time so a large file never has to be whole in memory:
// SHA-256 over a label and the SHA-256 of each 1 MiB chunk of the file before encryption, in
// order. Each chunk's own hash is WebCrypto's, so it runs at native speed. Whoever uploads a file
// signs this, and a reader checks the bytes they decrypted against it.
export default function blobHash() {
  const outer = sha256.create().update(utf8ToBytes('nil/blob-hash/v1'));
  return {
    async add(chunk: Uint8Array) {
      outer.update(new Uint8Array(await crypto.subtle.digest('SHA-256', chunk)));
    },
    done: () => b64u.encode(outer.digest()),
  };
}
