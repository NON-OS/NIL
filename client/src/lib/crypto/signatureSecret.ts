import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// A 32-byte secret from a deterministic wallet signature (RFC 6979: the same wallet signing the
// same message always gives the same r and s). Only r and the low-s form of s go in, so wallet
// software that writes the recovery byte differently, or doesn't normalise s, still lands on
// the same secret for the same key.
export default function signatureSecret(signature: string, label: string) {
  const raw = hexToBytes(signature.replace(/^0x/, ''));
  if (raw.length !== 65) throw new Error('Your wallet returned a signature Nil can’t read.');
  const compact = secp256k1.Signature.fromCompact(raw.slice(0, 64)).normalizeS().toCompactRawBytes();
  return hkdf(sha256, compact, utf8ToBytes('nil/wallet-secret/v1'), utf8ToBytes(label), 32);
}
