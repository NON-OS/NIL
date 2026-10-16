import sql from '../db/sql.js';

// Closes open invoices whose window has passed. One with a payment still on its way stays open
// until that payment settles, so a transfer mined just before the deadline still pays it.
// Whatever an expired invoice received becomes credit for the next one.
export default function expireInvoices(now = Date.now()) {
  return sql.run(
    `UPDATE billing_invoices SET status = 'expired', closed_at = ?
     WHERE status = 'open' AND expires_at < ?
       AND id NOT IN (SELECT invoice_id FROM billing_payments WHERE status IN ('seen', 'confirming') AND invoice_id IS NOT NULL)`,
    now, now,
  ).changes;
}
