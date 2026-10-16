import sql from '../db/sql.js';
import config from '../config.js';
import readReceipt from '../chain/readReceipt.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import attachReceipt from './attachReceipt.js';
import finalizePayment from './finalizePayment.js';
import log from '../lib/log.js';
import feeAt from '../services/feeAt.js';

async function follow(row, receipt, final, now) {
  if (row.status === 'seen') {
    if (receipt.state === 'mined') attachReceipt(row, receipt, { feeBps: await feeAt(receipt.blockNumber) });
    else if (receipt.state === 'failed') sql.run("UPDATE billing_payments SET status = 'failed', problem = ?, checked_at = ? WHERE id = ?", `The transaction failed on-chain, so nothing reached ${config.billing.treasuryName}. Send the payment again.`, now, row.id);
    else if (now - row.created_at > config.nox.missingTxMs) sql.run("UPDATE billing_payments SET status = 'dropped', problem = 'The transaction never showed up on-chain.', checked_at = ? WHERE id = ?", now, row.id);
    else sql.run('UPDATE billing_payments SET checked_at = ? WHERE id = ?', now, row.id);
    return;
  }

  if (receipt.state !== 'mined') {
    const failed = receipt.state === 'failed';
    const problem = failed ? 'After a chain reorganisation the transaction failed, so nothing arrived.' : 'A chain reorganisation removed this transfer. Nil keeps watching in case it is mined again.';
    sql.run('UPDATE billing_payments SET status = ?, problem = ?, checked_at = ? WHERE id = ?', failed ? 'failed' : 'dropped', problem, now, row.id);
    return;
  }
  // the same transfer, wherever it now sits in the block
  const same = (t) => t.token === row.token && t.to === config.plan.treasury && t.from === row.from_address && String(t.value) === row.amount;
  const transfer = receipt.transfers.find((t) => same(t) && t.logIndex === row.log_index) ?? receipt.transfers.find(same);
  if (!transfer) {
    sql.run("UPDATE billing_payments SET status = 'failed', problem = 'The transaction no longer contains this transfer.', checked_at = ? WHERE id = ?", now, row.id);
    return;
  }
  if (receipt.blockHash !== row.block_hash || transfer.logIndex !== row.log_index) {
    sql.run('UPDATE billing_payments SET block_number = ?, block_hash = ?, log_index = ?, checked_at = ? WHERE id = ?', receipt.blockNumber, receipt.blockHash, transfer.logIndex, now, row.id);
  }
  if (receipt.blockNumber > final) sql.run('UPDATE billing_payments SET checked_at = ? WHERE id = ?', now, row.id);
  else await finalizePayment(row.id, receipt);
}

// Follows every payment that isn't settled yet against the chain as it is now. A named
// transaction that gets mined becomes payments (or says why it can't). A transfer whose block
// changed in a reorg takes the new block and waits again; one that vanished is dropped until
// the treasury scan sees it mined again. A transfer whose block is final is counted.
export default async function confirmPayments(now = Date.now()) {
  const rows = sql.all("SELECT * FROM billing_payments WHERE status IN ('seen', 'confirming') ORDER BY created_at");
  if (!rows.length) return;
  const final = await finalizedBlock();

  for (const row of rows) {
    const receipt = await readReceipt(row.tx_hash);
    try {
      await follow(row, receipt, final, now);
    } catch (err) {
      // one odd row mustn't hold up the rest; it's tried again next minute
      log.error('billing', `payment check for ${row.id} failed`, err.message);
    }
  }
}
