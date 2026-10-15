import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/abstract/utils';

// Semaphore's hash for a message or scope: keccak256 of the 32-byte value, shifted right by
// 8 bits so it fits the circuit's field. Must match @semaphore-protocol/proof exactly.
export default function fieldHash(value: string | bigint) {
  return bytesToNumberBE(keccak_256(numberToBytesBE(BigInt(value), 32))) >> 8n;
}
