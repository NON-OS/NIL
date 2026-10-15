// Fractional ordering: a dropped card takes the midpoint of its new neighbours,
// so a reorder writes one row instead of renumbering the column.
export default function positionBetween(before: number | undefined, after: number | undefined) {
  if (before !== undefined && after !== undefined) return (before + after) / 2;
  if (before !== undefined) return before + 1024;
  if (after !== undefined) return after - 1024;
  return 0;
}
