import sql from '../db/sql.js';
import config from '../config.js';
import settleInvoice from './settleInvoice.js';

const DAY = 86_400_000;

// Brings every invoice still in play up to date with its settled payments: open ones, paid once
// they are covered (one made with nothing left to pay included), and paid ones that may still
// take extra time from a later payment. settleInvoice is safe to run again, so a restart between
// counting a payment and settling its invoice, or between making an invoice and settling it, is
// caught up on the next run. Returns how many changed.
export default function settleOpen(now = Date.now()) {
  const rows = sql.all("SELECT id FROM billing_invoices WHERE status = 'open' OR (status = 'paid' AND expires_at > ?)", now - config.billing.lateDays * DAY);
  return rows.filter(({ id }) => settleInvoice(id, now)).length;
}
