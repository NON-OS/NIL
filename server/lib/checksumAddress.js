import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// EIP-55 mixed-case checksum: the form wallets display and EIP-4361 messages carry.
export default function checksumAddress(address) {
  const lower = address.toLowerCase().slice(2);
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  return `0x${[...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
}
