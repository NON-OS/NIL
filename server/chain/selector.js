import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// The 4-byte function selector for a Solidity signature, as hex without 0x.
export default function selector(signature) {
  return bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);
}
