import sql from '../db/sql.js';
import config from '../config.js';
import sameSuffix from './sameSuffix.js';
import coverage from './coverage.js';

const DAY = 86_400_000;

// The invoice a transfer to the treasury pays, or null. Its amount must carry the suffix of an
// invoice here that is still watched, in that invoice's token, in a block at or after the one
// the invoice was made in. An amount Nil asked for (the invoice amount, or the top-up after a
// partial payment) always matches. Any other amount with the suffix, an under- or overpayment,
// matches only when the suffix is known to be this workspace's alone: with PLAN_INVOICE_SLOT
// set, or when an admin here named the transaction themselves.
export default function matchTransfer(transfer, { named = false, now = Date.now() } = {}) {
  const rows = sql.all(
    `SELECT i.*, a.amount, a.grid FROM billing_invoices i JOIN billing_amounts a ON a.invoice_id = i.id
     WHERE a.token = ? AND i.expires_at > ?`,
    transfer.token, now - config.billing.lateDays * DAY,
  );
  for (const inv of rows) {
    if (transfer.blockNumber < inv.start_block || !sameSuffix(transfer.value, inv.amount, inv.grid)) continue;
    if (config.billing.slot || named || transfer.value === BigInt(inv.amount)) return inv.id;
    const topUp = inv.status === 'open' ? coverage(inv).amounts.find((a) => a.token === transfer.token)?.ask : null;
    if (transfer.value === topUp) return inv.id;
  }
  return null;
}
