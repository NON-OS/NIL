import checksumAddress from './checksumAddress.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// An Ethereum address as an operator would paste it. All lower or all upper case carries no
// checksum and is taken as is. Mixed case is an EIP-55 checksum and has to match, which catches
// a mistyped character before the server reads balances or payments from the wrong contract.
export default function validAddress(value) {
  if (typeof value !== 'string' || !ADDRESS.test(value)) return false;
  const hex = value.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  return checksumAddress(value) === value;
}
