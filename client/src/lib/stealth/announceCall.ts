const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
const padRight = (hex: string) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');

// Call data for the ERC-5564 announcer: announce(1, stealthAddress, ephemeralPubKey, metadata).
// The metadata follows the standard's token layout: view tag, transfer selector, token, amount,
// so any ERC-5564 wallet can recognise the payout and what it holds.
export default function announceCall({ stealthAddress, ephemeralPublicKey, viewTag, token, amount }: { stealthAddress: string; ephemeralPublicKey: string; viewTag: number; token: string; amount: bigint }) {
  const eph = ephemeralPublicKey.replace(/^0x/, '');
  const meta = `${viewTag.toString(16).padStart(2, '0')}a9059cbb${token.replace(/^0x/, '').toLowerCase()}${word(amount.toString(16))}`;
  const ephWords = padRight(eph);
  const metaOffset = 128 + 32 + ephWords.length / 2;
  return `0x4d1f9583${word('1')}${word(stealthAddress)}${word('80')}${word(metaOffset.toString(16))}${word((eph.length / 2).toString(16))}${ephWords}${word((meta.length / 2).toString(16))}${padRight(meta)}`;
}
