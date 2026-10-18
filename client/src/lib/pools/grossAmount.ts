const BPS = 10_000n;

// What to withdraw so exactly `net` arrives after the entry contract keeps floor(gross * bps /
// 10000) for the relayer: the least such amount. The team pays the fee on top of the bounty.
export default function grossAmount(net: bigint, bps: bigint) {
  if (net <= 0n || bps < 0n || bps >= BPS) throw new Error('A payout needs a positive amount and a fee under 100%.');
  const arrives = (gross: bigint) => gross - (gross * bps) / BPS;
  let gross = (net * BPS + (BPS - bps) - 1n) / (BPS - bps);
  while (gross > net && arrives(gross - 1n) >= net) gross -= 1n;
  while (arrives(gross) < net) gross += 1n;
  return gross;
}
