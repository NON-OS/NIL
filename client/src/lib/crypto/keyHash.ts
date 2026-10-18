import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import b64u from './b64u';

// Names a doc or task key without giving it away: SHA-256 over a label and the key. A writer
// signs it next to their words, so a reader can tell the key they unwrapped is the one the
// writer meant, and not one the server sealed to them in its place.
export default function keyHash(key: Uint8Array) {
  return b64u.encode(sha256(concatBytes(utf8ToBytes('nil/key-hash/v1'), key)));
}
