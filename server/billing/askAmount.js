// The exact amount to ask for: at least `minimum` smallest units, rounded up to the price grid,
// with the suffix (`tail`, already in smallest units) in the places below it.
export default function askAmount(minimum, grid, tail) {
  const floor = minimum > 0n ? minimum : 0n;
  return ((floor + grid - 1n) / grid) * grid + tail;
}
