import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

// Withdraws an open invoice. Anything it already received becomes credit. Not while a payment
// is on its way, since that money should settle against the invoice it was sent for.
export default function cancelInvoice(id) {
  const invoice = sql.get('SELECT status FROM billing_invoices WHERE id = ?', id);
  if (!invoice) throw HttpError.notFound('That invoice');
  if (invoice.status !== 'open') throw HttpError.badRequest('Only an open invoice can be cancelled.');
  if (sql.get("SELECT 1 FROM billing_payments WHERE invoice_id = ? AND status IN ('seen', 'confirming')", id)) {
    throw new HttpError(409, 'A payment for this invoice is on its way. Wait until it settles.');
  }
  sql.run("UPDATE billing_invoices SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'", Date.now(), id);
}
