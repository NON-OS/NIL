const HEX = /^0x[0-9a-f]{192}$/;

// The relayer's signed terms, abi.encode(recipient, feeRecipient, relayFeeBPS), read here so
// the browser itself checks where the money goes before it proves anything.
export default function relayTerms(hex: string) {
  const data = hex.toLowerCase();
  if (!HEX.test(data)) throw new Error('The relayer’s terms are malformed.');
  const words = data.slice(2).match(/.{64}/g)!;
  return { recipient: `0x${words[0].slice(24)}`, feeRecipient: `0x${words[1].slice(24)}`, feeBps: BigInt(`0x${words[2]}`) };
}
