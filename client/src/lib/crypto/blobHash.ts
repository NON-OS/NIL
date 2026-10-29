import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import b64u from './b64u';

const LABEL = 'nil/blob-hash/v1';

// A file's content hash, built a chunk at a time so a large file never has to be whole in memory:
// SHA-256 over a label and the SHA-256 of each 1 MiB chunk of the file before encryption, in
// order. Each chunk's own hash is WebCrypto's, so it runs at native speed. Whoever uploads a file
// signs this, and a reader checks the bytes they decrypted against it. The chunks' hashes are kept
// too (`list`), for a file's chunk list (see chunkHashes).
export default function blobHash() {
  const outer = sha256.create().update(utf8ToBytes(LABEL));
  const each: Uint8Array[] = [];
  return {
    async add(chunk: Uint8Array) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', chunk));
      outer.update(digest);
      each.push(digest);
      return digest;
    },
    done: () => b64u.encode(outer.clone().digest()),
    list: () => concatBytes(...each),
  };
}

// the hash a list of chunk hashes adds up to
blobHash.of = (list: Uint8Array) => b64u.encode(sha256.create().update(utf8ToBytes(LABEL)).update(list).digest());
