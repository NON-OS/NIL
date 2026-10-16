import config from '../config.js';

// How an asked amount is laid out in a token's smallest units. Amounts use at most
// PLAN_AMOUNT_DECIMALS decimal places, so wallets and exchanges can send them exactly; the last
// PLAN_SUFFIX_DIGITS of those places hold the invoice's suffix and everything above them is
// the price, rounded up.
//
//   low:  one unit of the last decimal place in use (everything below it stays zero)
//   grid: one unit of the price part, the step a rounded price moves in
export default function amountGrid(decimals) {
  const used = Math.min(decimals, config.billing.amountDecimals);
  const low = 10n ** BigInt(decimals - used);
  return { low, grid: low * 10n ** BigInt(config.billing.suffixDigits) };
}
