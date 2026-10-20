import sql from '../db/sql.js';

// Money that reached the treasury but hasn't bought anything yet, in micro-USD: what was paid
// into invoices that expired or were cancelled (with the credit they had drawn), payments that
// arrived after their invoice's window, the part of a seats invoice paid beyond its price, and
// the part of a periods invoice paid beyond the most Pro time it can buy.
// Every invoice draws its credit when it's made. An invoice with a payment still on its way
// keeps its value until that payment settles, so the same money can't be spent twice.
export default function creditBalance() {
  const paidIn = new Map(sql.all("SELECT invoice_id, SUM(usd) AS usd FROM billing_payments WHERE status = 'final' AND on_time = 1 AND invoice_id IS NOT NULL GROUP BY invoice_id").map((r) => [r.invoice_id, r.usd]));
  const busy = new Set(sql.all("SELECT DISTINCT invoice_id FROM billing_payments WHERE status IN ('seen', 'confirming') AND invoice_id IS NOT NULL").map((r) => r.invoice_id));
  let pool = sql.get("SELECT COALESCE(SUM(usd), 0) AS usd FROM billing_payments WHERE status = 'final' AND on_time = 0 AND usd IS NOT NULL").usd;
  pool += sql.get("SELECT COALESCE(SUM(p.over_usd), 0) AS usd FROM billing_payments p JOIN billing_invoices i ON i.id = p.invoice_id WHERE p.status = 'final' AND p.on_time = 1 AND i.status = 'paid' AND i.kind = 'periods'").usd;

  for (const inv of sql.all('SELECT id, kind, status, credit_usd, total_usd FROM billing_invoices')) {
    const valueIn = inv.credit_usd + (paidIn.get(inv.id) ?? 0);
    pool -= inv.credit_usd;
    if ((inv.status === 'expired' || inv.status === 'cancelled') && !busy.has(inv.id)) pool += valueIn;
    else if (inv.status === 'paid' && inv.kind === 'seats') pool += Math.max(0, valueIn - inv.total_usd);
  }
  return Math.max(0, pool);
}
