import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import matchTransfer from './matchTransfer.js';
import spentElsewhere from './spentElsewhere.js';

// The row already saved for this transfer: by transaction and log, or else one for the same
// transfer that a reorg moved to another place in its block or took out of the chain. A row in
// the same block as this transfer is another transfer of that transaction, so it is left alone.
function savedAs(transfer) {
  const exact = sql.get('SELECT id, status, block_hash FROM billing_payments WHERE tx_hash = ? AND log_index = ?', transfer.txHash, transfer.logIndex);
  if (exact) return exact;
  return sql.get(
    `SELECT id, status, block_hash FROM billing_payments
     WHERE tx_hash = ? AND token = ? AND from_address = ? AND amount = ? AND status IN ('confirming', 'dropped') AND block_hash IS NOT ?
     ORDER BY created_at LIMIT 1`,
    transfer.txHash, transfer.token, transfer.from, String(transfer.value), transfer.blockHash,
  );
}

// Saves a transfer to the treasury that pays one of this workspace's invoices, as
// "confirming" until its block is final. A transfer is saved once, a transaction that pays a
// bounty is never counted here, and a transaction someone told us about before it was mined
// gives up its placeholder. `named` is the invoice an admin named the transaction for, if any.
// Returns the payment id, or null.
export default function recordTransfer(transfer, { named = null, feeBps = 0 } = {}) {
  if (transfer.to !== config.plan.treasury) return null;
  const hash = transfer.txHash;
  const existing = savedAs(transfer);
  if (existing) {
    // a reorg moved it, or it came back after being dropped: confirm it again where it is now
    if (existing.status === 'dropped' || (existing.status === 'confirming' && existing.block_hash !== transfer.blockHash)) {
      sql.run(
        "UPDATE billing_payments SET status = 'confirming', problem = NULL, log_index = ?, block_number = ?, block_hash = ?, checked_at = ? WHERE id = ?",
        transfer.logIndex, transfer.blockNumber, transfer.blockHash, Date.now(), existing.id,
      );
    }
    return existing.id;
  }
  if (spentElsewhere(hash)) return null;
  const match = matchTransfer(transfer, { named, feeBps });
  if (!match) return null;

  const id = newId();
  sql.tx(() => {
    sql.run("DELETE FROM billing_payments WHERE tx_hash = ? AND log_index = -1 AND status IN ('seen', 'unmatched', 'dropped')", hash);
    sql.run(
      "INSERT INTO billing_payments (id, invoice_id, tx_hash, log_index, token, from_address, amount, token_fee, status, block_number, block_hash, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirming', ?, ?, ?, ?)",
      id, match.invoiceId, hash, transfer.logIndex, transfer.token, transfer.from, String(transfer.value), String(match.fee), transfer.blockNumber, transfer.blockHash, Date.now(), Date.now(),
    );
  });
  return id;
}
