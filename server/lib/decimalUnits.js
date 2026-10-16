// "0.0042" scaled by 10^decimals as a BigInt, cutting digits beyond that precision. Null for
// anything that isn't a plain non-negative decimal.
export default function decimalUnits(text, decimals) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(text ?? ''));
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(decimals, '0').slice(0, decimals);
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction || '0');
}
