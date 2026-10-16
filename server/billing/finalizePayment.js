import sql from '../db/sql.js';
import blockAt from '../chain/blockAt.js';
import noxRate from './noxRate.js';
import unitsToUsd from './unitsToUsd.js';
import settleInvoice from './settleInvoice.js';

// Counts a transfer whose block is final. It pays its invoice if it was mined inside the
// invoice's window (by the block's own time); otherwise it becomes credit. A late NOX payment
// is valued at the lower of the locked rate and today's, so waiting for NOX to fall after
// locking a rate never pays off.
export default async function finalizePayment(id, receipt) {
  const block = await blockAt(receipt.blockNumber);
  // the node hasn't settled on that block yet; look again on the next run
  if (!block || block.hash !== receipt.blockHash) return false;

  const row = sql.get('SELECT * FROM billing_payments WHERE id = ?', id);
  const invoice = row && sql.get('SELECT * FROM billing_invoices WHERE id = ?', row.invoice_id);
  const asked = invoice && sql.get('SELECT * FROM billing_amounts WHERE invoice_id = ? AND token = ?', invoice.id, row.token);
  if (!asked) return false;

  const onTime = invoice.status !== 'cancelled' && block.time <= invoice.expires_at;
  let rate = BigInt(asked.rate);
  if (!onTime && asked.rate_source !== 'face') {
    const today = await noxRate();
    if (today && today.rate < rate) rate = today.rate;
  }
  const { changes } = sql.run(
    "UPDATE billing_payments SET status = 'final', problem = NULL, usd = ?, on_time = ?, block_number = ?, block_hash = ?, final_at = ?, checked_at = ? WHERE id = ? AND status = 'confirming'",
    unitsToUsd(row.amount, asked.decimals, rate), onTime ? 1 : 0, receipt.blockNumber, receipt.blockHash, Date.now(), Date.now(), id,
  );
  if (changes) settleInvoice(invoice.id);
  return Boolean(changes);
}
