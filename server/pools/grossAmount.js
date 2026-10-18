const BPS = 10_000n;

// What to withdraw so the recipient gets exactly `net` once the entry contract keeps its relay
// fee, floor(gross * bps / 10000). Every net amount has one: each step up in the gross adds 0 or
// 1 to what arrives. The team pays the fee on top, and the contributor gets the exact amount
// Nil asked for.
export default function grossAmount(net, bps) {
  if (net <= 0n || bps < 0n || bps >= BPS) throw new Error('grossAmount needs a positive amount and a fee under 100%');
  let gross = (net * BPS + (BPS - bps) - 1n) / (BPS - bps);
  while (gross - (gross * bps) / BPS > net) gross -= 1n;
  while (gross - (gross * bps) / BPS < net) gross += 1n;
  return gross;
}
