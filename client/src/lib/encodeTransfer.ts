// Call data for ERC-20 transfer(address to, uint256 amount): the 4-byte selector followed by
// both arguments left-padded to 32 bytes.
export default function encodeTransfer(to: string, amount: bigint) {
  const address = to.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  return `0xa9059cbb${address}${amount.toString(16).padStart(64, '0')}`;
}
