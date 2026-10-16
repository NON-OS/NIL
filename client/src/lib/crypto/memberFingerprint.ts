import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import b64u from './b64u';

// What two people read out to each other to check a key, in person or over a call: the first
// 80 bits of SHA-256 over both public keys, as five groups of four hex digits.
export default function memberFingerprint(publicKey: string, signingKey: string) {
  const digest = sha256(concatBytes(utf8ToBytes('nil/fingerprint/v1'), b64u.decode(publicKey), b64u.decode(signingKey)));
  return bytesToHex(digest).slice(0, 20).match(/.{4}/g)!.join('-');
}
