// 250000000000000000000 wei with 18 decimals → "250". Keeps up to `digits` decimals and
// groups thousands, using BigInt so large balances never lose precision. An amount too small
// to show at that many decimals reads "<0.0001" rather than a misleading 0.
export default function formatUnits(value: string | bigint, decimals: number, digits = 4) {
  const raw = BigInt(value);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toLocaleString('en-US');
  const fraction = (abs % base).toString().padStart(decimals, '0').slice(0, digits).replace(/0+$/, '');
  if (abs > 0n && abs < base && !fraction) return `${negative ? '>-' : '<'}${digits > 0 ? `0.${'1'.padStart(digits, '0')}` : '1'}`;
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
