// "12.5" with 18 decimals → "12500000000000000000". Returns null for anything that isn't a
// plain positive number, including more decimals than the token supports.
export default function parseUnits(input: string, decimals: number): string | null {
  const text = input.trim().replace(/[,_\s]/g, '');
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  const wei = BigInt(match[1] || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  return wei > 0n ? wei.toString() : null;
}
