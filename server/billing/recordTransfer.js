import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import matchTransfer from './matchTransfer.js';
import spentElsewhere from './spentElsewhere.js';

// Saves a transfer to the treasury that pays one of this workspace's invoices, as
// "confirming" until its block is final. A transfer is saved once (by transaction and log), a
// transaction that pays a bounty is never counted here, and a transaction someone told us about
// before it was mined gives up its placeholder. Returns the payment id, or null.
export default function recordTransfer(transfer, { named = false } = {}) {
  if (transfer.to !== config.plan.treasury) return null;
  const hash = transfer.txHash;
  const existing = sql.get('SELECT id, status, block_hash FROM billing_payments WHERE tx_hash = ? AND log_index = ?', hash, transfer.logIndex);
  if (existing) {
    // a reorg moved it to another block, or it came back after being dropped: confirm it again
    if (existing.status === 'dropped' || (existing.status === 'confirming' && existing.block_hash !== transfer.blockHash)) {
      sql.run("UPDATE billing_payments SET status = 'confirming', problem = NULL, block_number = ?, block_hash = ?, checked_at = ? WHERE id = ?", transfer.blockNumber, transfer.blockHash, Date.now(), existing.id);
    }
    return existing.id;
  }
  if (spentElsewhere(hash)) return null;
  const invoiceId = matchTransfer(transfer, { named });
  if (!invoiceId) return null;

  const id = newId();
  sql.tx(() => {
    sql.run("DELETE FROM billing_payments WHERE tx_hash = ? AND log_index = -1 AND status IN ('seen', 'unmatched')", hash);
    sql.run(
      "INSERT INTO billing_payments (id, invoice_id, tx_hash, log_index, token, from_address, amount, status, block_number, block_hash, created_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirming', ?, ?, ?, ?)",
      id, invoiceId, hash, transfer.logIndex, transfer.token, transfer.from, String(transfer.value), transfer.blockNumber, transfer.blockHash, Date.now(), Date.now(),
    );
  });
  return id;
}
