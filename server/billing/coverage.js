import sql from '../db/sql.js';
import askAmount from './askAmount.js';
import paidFraction from './paidFraction.js';

const { SCALE } = paidFraction;

// How far an invoice is covered once everything on its way lands (settled on-time payments plus
// transfers waiting for finality), in billionths, and for each token what's left and the exact
// amount to send to finish: what's left, rounded up to the price grid, with the same suffix, so
// a top-up is matched to this invoice like the first payment was.
export default function coverage(invoice) {
  const amounts = sql.all('SELECT * FROM billing_amounts WHERE invoice_id = ? ORDER BY symbol', invoice.id);
  const arriving = new Map();
  // what was sent: what arrived plus anything the token kept as a fee
  for (const p of sql.all("SELECT token, amount, token_fee FROM billing_payments WHERE invoice_id = ? AND ((status = 'final' AND on_time = 1) OR status = 'confirming')", invoice.id)) {
    arriving.set(p.token, (arriving.get(p.token) ?? 0n) + BigInt(p.amount) + BigInt(p.token_fee));
  }
  let covered = invoice.due_usd === 0 ? SCALE : 0n;
  for (const a of amounts) covered += ((arriving.get(a.token) ?? 0n) * SCALE) / BigInt(a.amount);
  const left = covered < SCALE ? SCALE - covered : 0n;
  const partial = covered > 0n && covered < SCALE;

  return {
    covered,
    amounts: amounts.map((a) => {
      const remaining = (BigInt(a.amount) * left) / SCALE;
      const grid = BigInt(a.grid);
      return { ...a, received: arriving.get(a.token) ?? 0n, remaining, ask: partial ? askAmount(remaining, grid, BigInt(a.amount) % grid) : BigInt(a.amount) };
    }),
  };
}
