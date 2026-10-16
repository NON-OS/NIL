// 250000000000000000000 with 18 decimals → "250". BigInt all the way, so nothing rounds.
export default function formatUnits(value, decimals, digits = 4) {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = (raw / base).toLocaleString('en-US');
  const fraction = (raw % base).toString().padStart(decimals, '0').slice(0, digits).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
