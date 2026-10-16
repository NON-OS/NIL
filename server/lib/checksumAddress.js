import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// The EIP-55 spelling of an address: each letter is upper case where the matching nibble of the
// address's keccak hash is 8 or more.
export default function checksumAddress(address) {
  const lower = address.toLowerCase().slice(2);
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  return `0x${[...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
}
