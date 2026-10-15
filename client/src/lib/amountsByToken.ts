import tokenAmount from './tokenAmount';

// Adds up amounts per token and writes them as one line: "595 NOX · 100 USDC".
export default function amountsByToken(items: { amount: string; token: string | null }[], empty = '0') {
  const sums = new Map<string, bigint>();
  for (const { amount, token } of items) sums.set(token ?? '', (sums.get(token ?? '') ?? 0n) + BigInt(amount));
  if (!sums.size) return empty;
  return [...sums].map(([token, sum]) => tokenAmount(sum, token || null, 2)).join(' · ');
}
