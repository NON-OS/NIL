// Whether a transferred amount ends in the same suffix as one Nil asked for, on that amount's
// grid: everything below the price part has to match, digits beyond the suffix included.
export default function sameSuffix(value, asked, grid) {
  return BigInt(value) % BigInt(grid) === BigInt(asked) % BigInt(grid);
}
