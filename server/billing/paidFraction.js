import sql from '../db/sql.js';

const SCALE = 1_000_000_000n;

// How much of an invoice its settled, on-time payments cover, in billionths: 10^9 is exactly
// paid, more is overpaid. Payments in different tokens add up by their share of each token's
// asked amount. An invoice with nothing left to pay after credit counts as paid.
export default function paidFraction(invoice) {
  if (invoice.due_usd === 0) return SCALE;
  const asked = new Map(sql.all('SELECT token, amount FROM billing_amounts WHERE invoice_id = ?', invoice.id).map((r) => [r.token, BigInt(r.amount)]));
  // summed per token before dividing, so two payments that add up to the asked amount make
  // exactly one, with no rounding lost between them
  const received = new Map();
  for (const p of sql.all("SELECT token, amount, token_fee FROM billing_payments WHERE invoice_id = ? AND status = 'final' AND on_time = 1", invoice.id)) {
    if (asked.has(p.token)) received.set(p.token, (received.get(p.token) ?? 0n) + BigInt(p.amount) + BigInt(p.token_fee));
  }
  let fraction = 0n;
  for (const [token, amount] of received) fraction += (amount * SCALE) / asked.get(token);
  return fraction;
}

paidFraction.SCALE = SCALE;
