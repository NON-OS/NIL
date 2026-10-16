import amountGrid from './amountGrid.js';

// The suffix a transferred amount carries, or null when it has digits below the places Nil
// uses, which no amount Nil asked for ever has.
export default function suffixOf(value, decimals) {
  const { low, grid } = amountGrid(decimals);
  if (value % low !== 0n) return null;
  return Number((value % grid) / low);
}
