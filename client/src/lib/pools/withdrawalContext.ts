import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, '0');

// keccak256(abi.encode((processooor, data), scope)) in the SNARK field: what binds a withdrawal
// proof to its recipient and fee, so nobody can lift it onto other terms.
export default function withdrawalContext(processooor: string, data: string, scope: bigint) {
  const bytes = data.replace(/^0x/, '').toLowerCase();
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0');
  const encoded = `${word(0x40)}${word(scope)}${processooor.replace(/^0x/, '').toLowerCase().padStart(64, '0')}${word(0x40)}${word(bytes.length / 2)}${padded}`;
  return BigInt(`0x${bytesToHex(keccak_256(hexToBytes(encoded)))}`) % FIELD;
}
