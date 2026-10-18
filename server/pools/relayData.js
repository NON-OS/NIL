const HEX = /^0x[0-9a-f]{192}$/;

// The relayer's terms inside a relayed withdrawal: abi.encode(recipient, feeRecipient,
// relayFeeBPS), exactly three static words, or null for anything else.
export default function relayData(hex) {
  const data = String(hex ?? '').toLowerCase();
  if (!HEX.test(data)) return null;
  const words = data.slice(2).match(/.{64}/g);
  if (!words[0].startsWith('0'.repeat(24)) || !words[1].startsWith('0'.repeat(24))) return null;
  return { recipient: `0x${words[0].slice(24)}`, feeRecipient: `0x${words[1].slice(24)}`, feeBps: BigInt(`0x${words[2]}`) };
}
