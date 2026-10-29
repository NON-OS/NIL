import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// The Ethereum address of a private key given as hex.
export default function addressOf(hex) {
  return `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(hexToBytes(hex), false).slice(1)).slice(-20))}`;
}
