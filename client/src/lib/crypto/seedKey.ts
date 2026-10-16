import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

// One independent secret per purpose from a member's identity seed (HKDF-SHA256, a label each).
// Learning one of them says nothing about the others or about the seed.
export default function seedKey(seed: Uint8Array, label: string, length = 32) {
  return hkdf(sha256, seed, utf8ToBytes('nil/identity/v2'), utf8ToBytes(label), length);
}
