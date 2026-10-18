const META = /^st:eth:0x((?:02|03)[0-9a-f]{64}(?:02|03)[0-9a-f]{64})$/;
const word = (hex: string) => hex.padStart(64, '0');

// Call data for the ERC-6538 registry: registerKeys(1, stealthMetaAddress), which publishes a
// scheme 1 meta-address for the wallet that sends it. The bytes are the 66 after "st:eth:0x":
// the compressed spending key, then the compressed viewing key.
export default function registerKeysCall(metaAddress: string) {
  const match = META.exec(metaAddress.toLowerCase());
  if (!match) throw new Error('Your meta-address is malformed. Turn private payouts off and on again.');
  const bytes = match[1];
  return `0x042c7aa3${word('1')}${word('40')}${word((bytes.length / 2).toString(16))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
}
