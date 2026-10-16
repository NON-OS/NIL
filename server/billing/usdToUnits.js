const E18 = 10n ** 18n;
const MICRO = 1_000_000n;

// The smallest units of a token worth at least `microUsd` at `rate` (USD per whole token,
// scaled by 10^18), rounded up so the treasury never receives less than the price.
export default function usdToUnits(microUsd, decimals, rate) {
  const numerator = BigInt(microUsd) * 10n ** BigInt(decimals) * E18;
  const denominator = MICRO * BigInt(rate);
  return (numerator + denominator - 1n) / denominator;
}
