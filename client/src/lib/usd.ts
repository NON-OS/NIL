// "$12.00" from micro-USD, the unit prices and credit travel in. Amounts under a cent keep their
// digits ("$0.0042") so a suffix or a rounding remainder never reads as nothing.
export default function usd(micro: number) {
  const negative = micro < 0;
  const abs = Math.abs(micro);
  const whole = Math.floor(abs / 1_000_000).toLocaleString('en-US');
  const cents = String(abs % 1_000_000).padStart(6, '0');
  const digits = abs > 0 && abs < 10_000 ? cents.replace(/0+$/, '') : cents.slice(0, 2);
  return `${negative ? '−' : ''}$${whole}.${digits}`;
}
