import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import plan from '../services/plan.js';
import createInvoice from './createInvoice.js';

// A fresh invoice for what an expired or cancelled one was for, at today's price and rate.
// Whatever the old one received is credit by now, so it comes off the new one.
export default async function retryInvoice(actor, id) {
  const invoice = sql.get('SELECT * FROM billing_invoices WHERE id = ?', id);
  if (!invoice) throw HttpError.notFound('That invoice');
  if (!['expired', 'cancelled'].includes(invoice.status)) throw HttpError.badRequest('Only an expired or cancelled invoice can be made again.');
  const people = Math.max(invoice.people, plan.status().seatsUsed);
  return createInvoice(actor, { kind: invoice.kind, periods: invoice.periods || 1, people, retryOf: invoice.id });
}
