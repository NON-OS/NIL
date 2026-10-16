const E18 = 10n ** 18n;

// What an amount of a token is worth in micro-USD at `rate` (USD per whole token, scaled by
// 10^18), rounded down so credit is never more than what arrived.
export default function unitsToUsd(amount, decimals, rate) {
  return Number((BigInt(amount) * BigInt(rate) * 1_000_000n) / (10n ** BigInt(decimals) * E18));
}
