// 250000000000000000000 wei with 18 decimals → "250". Keeps up to `digits` decimals and
// groups thousands, using BigInt so large balances never lose precision.
export default function formatUnits(value: string | bigint, decimals: number, digits = 4) {
  const raw = BigInt(value);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toLocaleString('en-US');
  const fraction = (abs % base).toString().padStart(decimals, '0').slice(0, digits).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
