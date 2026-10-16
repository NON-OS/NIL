import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import fromBase64Url from './fromBase64Url';

// Same format the server shows: first 64 bits of SHA-256 over the raw public key.
export default function keyFingerprint(key: string) {
  return bytesToHex(sha256(fromBase64Url(key))).slice(0, 16).match(/.{4}/g)!.join('-');
}
