import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import messageDigest from './messageDigest.mjs';

// What a wallet returns for personal_sign: r, s and v as 27 or 28.
export default function personalSign(key, message) {
  const sig = secp256k1.sign(messageDigest(message), key);
  return `0x${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
}
