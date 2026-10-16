// Plain aligned columns for a terminal. No colours, so output pastes cleanly into tickets.
export default function table(headers, rows) {
  const all = [headers, ...rows.map((row) => row.map((cell) => String(cell ?? '')))];
  const widths = headers.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  return all.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ')).join('\n');
}
