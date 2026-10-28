import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

// A frame key one step on, the way LiveKit steps one when a frame doesn't decrypt: HKDF-SHA256
// with this salt and 128 zero bytes of info. One way, so whoever holds the stepped key can't go
// back to the one before.
const SALT = 'nil/call-media-ratchet/v1';

export default function frameRatchet(key: Uint8Array): Uint8Array {
  return hkdf(sha256, key, utf8ToBytes(SALT), new Uint8Array(128), 32);
}

frameRatchet.salt = SALT;
