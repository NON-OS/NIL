import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

// What a withdrawal proof is bound to: keccak256(abi.encode(withdrawal, scope)) in the SNARK
// field, with withdrawal = (processooor, data). A proof made for other terms (another recipient,
// another fee) carries another context, and the pool refuses it.
export default function withdrawalContext(processooor, data, scope) {
  const bytes = data.replace(/^0x/, '').toLowerCase();
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0');
  const encoded = `${word(0x40)}${word(scope)}${processooor.replace(/^0x/, '').toLowerCase().padStart(64, '0')}${word(0x40)}${word(bytes.length / 2)}${padded}`;
  return BigInt(`0x${bytesToHex(keccak_256(hexToBytes(encoded)))}`) % FIELD;
}
