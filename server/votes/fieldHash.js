import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/abstract/utils';

// keccak256 of a 32-byte value shifted right 8 bits: Semaphore's way of fitting a scope into
// the circuit's field. Encrypted ballots hash their scope the same way.
export default function fieldHash(value) {
  return (bytesToNumberBE(keccak_256(numberToBytesBE(BigInt(value), 32))) >> 8n).toString();
}
