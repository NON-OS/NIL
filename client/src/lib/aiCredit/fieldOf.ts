import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// The first 31 bytes of a SHA-256, as a decimal string: always inside the circuit's field.
// The server works out scopes and messages the same way.
export default function fieldOf(text: string) {
  return BigInt(`0x${bytesToHex(sha256(utf8ToBytes(text))).slice(0, 62)}`).toString();
}
