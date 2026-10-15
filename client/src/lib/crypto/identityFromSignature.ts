import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// Wallet signatures are deterministic (RFC 6979), so the same wallet signing the same message
// always produces the same bytes. Those bytes, stretched with HKDF, become an X25519 key pair.
export default function identityFromSignature(signature: string) {
  const seed = hkdf(sha256, hexToBytes(signature.replace(/^0x/, '')), utf8ToBytes('nonos/e2ee/v1'), utf8ToBytes('x25519 identity'), 32);
  return { privateKey: seed, publicKey: x25519.getPublicKey(seed) };
}
