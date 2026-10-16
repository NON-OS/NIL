import amountGrid from './amountGrid.js';

// The exact amount to ask for: at least `minimum` smallest units, rounded up to the price grid,
// with the suffix written into the last decimal places in use.
export default function askAmount(minimum, decimals, suffix) {
  const { low, grid } = amountGrid(decimals);
  const floor = minimum > 0n ? minimum : 0n;
  return ((floor + grid - 1n) / grid) * grid + BigInt(suffix) * low;
}
