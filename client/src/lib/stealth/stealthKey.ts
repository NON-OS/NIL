import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/abstract/utils';

// The private key of one payout's one-time address: spending key + keccak256(v·Eph) mod n,
// as ERC-5564 scheme 1 defines it. Returns its address too, so callers can check it matches.
export default function stealthKey(spendingKey: Uint8Array, viewingKey: Uint8Array, ephemeralPublicKey: string) {
  const hashed = keccak_256(secp256k1.getSharedSecret(viewingKey, hexToBytes(ephemeralPublicKey.replace(/^0x/, '')), true));
  const key = numberToBytesBE((bytesToNumberBE(spendingKey) + bytesToNumberBE(hashed)) % secp256k1.CURVE.n, 32);
  return { privateKey: key, address: `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}` };
}
