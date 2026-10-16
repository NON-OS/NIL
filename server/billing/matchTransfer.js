import sql from '../db/sql.js';
import config from '../config.js';
import sameSuffix from './sameSuffix.js';
import coverage from './coverage.js';
import netOfFee from './netOfFee.js';

const DAY = 86_400_000;

// The invoice a transfer to the treasury pays, as { invoiceId, fee }, or null. Its amount must
// carry the suffix of an invoice here that is still watched, in that invoice's token, in a block
// at or after the one the invoice was made in. An amount Nil asked for (the invoice amount, or the
// top-up after a partial payment) always matches. Any other amount with the suffix, an under- or
// overpayment, matches only when the suffix is known to be this workspace's alone: with
// PLAN_INVOICE_SLOT set, or when an admin here named the transaction themselves.
//
// When NOX keeps a fee on transfers between wallets (`feeBps`), an amount Nil asked for arrives
// short by exactly that fee and loses its suffix on the way. It still matches, and `fee` says how
// much the token kept, so the invoice counts what was sent.
export default function matchTransfer(transfer, { named = false, now = Date.now(), feeBps = 0 } = {}) {
  const rows = sql.all(
    `SELECT i.*, a.amount, a.grid FROM billing_invoices i JOIN billing_amounts a ON a.invoice_id = i.id
     WHERE a.token = ? AND i.expires_at > ?`,
    transfer.token, now - config.billing.lateDays * DAY,
  );
  const charged = feeBps > 0 && transfer.token === config.nox.token;
  const topUp = (inv) => (inv.status === 'open' ? coverage(inv).amounts.find((a) => a.token === transfer.token)?.ask ?? null : null);
  for (const inv of rows) {
    if (transfer.blockNumber < inv.start_block) continue;
    if (sameSuffix(transfer.value, inv.amount, inv.grid)) {
      if (config.billing.slot || named || transfer.value === BigInt(inv.amount) || transfer.value === topUp(inv)) return { invoiceId: inv.id, fee: 0n };
      continue;
    }
    if (!charged) continue;
    for (const asked of [BigInt(inv.amount), topUp(inv)].filter(Boolean)) {
      if (transfer.value === netOfFee(asked, feeBps)) return { invoiceId: inv.id, fee: asked - transfer.value };
    }
  }
  return null;
}
