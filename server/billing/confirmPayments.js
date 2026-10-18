import sql from '../db/sql.js';
import config from '../config.js';
import readReceipt from '../chain/readReceipt.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import attachReceipt from './attachReceipt.js';
import finalizePayment from './finalizePayment.js';
import feeTaken from './feeTaken.js';
import log from '../lib/log.js';
import feeAt from '../services/feeAt.js';

const DAY = 86_400_000;

async function follow(row, receipt, final, now) {
  if (row.status === 'seen') {
    if (receipt.state === 'mined') attachReceipt(row, receipt, { feeBps: await feeAt(receipt.blockNumber) });
    else if (receipt.state === 'failed') sql.run("UPDATE billing_payments SET status = 'failed', problem = ?, checked_at = ? WHERE id = ?", `The transaction failed on-chain, so nothing reached ${config.billing.treasuryName}. Send the payment again.`, now, row.id);
    else if (now - row.created_at > config.nox.missingTxMs) sql.run("UPDATE billing_payments SET status = 'dropped', problem = 'The transaction never showed up on-chain.', checked_at = ? WHERE id = ?", now, row.id);
    else sql.run('UPDATE billing_payments SET checked_at = ? WHERE id = ?', now, row.id);
    return;
  }

  if (receipt.state === 'unknown') {
    // A reorg took it out, or a node behind a load balancer hasn't caught up with a block it
    // already called final. Either way it may well come back, so it stays confirming, without a
    // block, and is looked for again on every run until PLAN_LATE_DAYS have passed.
    if (now - row.created_at > config.billing.lateDays * DAY) {
      sql.run("UPDATE billing_payments SET status = 'dropped', problem = ?, block_number = NULL, block_hash = NULL, checked_at = ? WHERE id = ?", 'The transaction left the chain and didn’t come back. Name it again if it does.', now, row.id);
    } else {
      sql.run('UPDATE billing_payments SET problem = ?, block_number = NULL, block_hash = NULL, checked_at = ? WHERE id = ?', 'The transaction isn’t in a block right now, after a chain reorganisation or a node that fell behind. Nil keeps looking for it.', now, row.id);
    }
    return;
  }
  if (receipt.state === 'failed') {
    sql.run("UPDATE billing_payments SET status = 'failed', problem = 'After a chain reorganisation the transaction failed, so nothing arrived.', checked_at = ? WHERE id = ?", now, row.id);
    return;
  }
  // the same transfer, wherever it now sits in the block
  const same = (t) => t.token === row.token && t.to === config.plan.treasury && t.from === row.from_address && String(t.value) === row.amount;
  const transfer = receipt.transfers.find((t) => same(t) && t.logIndex === row.log_index) ?? receipt.transfers.find(same);
  if (!transfer) {
    sql.run("UPDATE billing_payments SET status = 'failed', problem = 'The transaction no longer contains this transfer.', checked_at = ? WHERE id = ?", now, row.id);
    return;
  }
  // matched as short by NOX's fee: the token must be seen keeping it, or it is just short
  if (BigInt(row.token_fee) > 0n && !feeTaken(receipt.transfers, { token: row.token, from: row.from_address, fee: BigInt(row.token_fee), except: transfer.logIndex })) {
    sql.run("UPDATE billing_payments SET status = 'failed', problem = 'This arrived short of the amount Nil asked for by exactly NOX’s transfer fee, but the token kept no fee on it, so it can’t count. Send the exact amount.', checked_at = ? WHERE id = ?", now, row.id);
    return;
  }
  if (receipt.blockHash !== row.block_hash || transfer.logIndex !== row.log_index) {
    sql.run('UPDATE billing_payments SET block_number = ?, block_hash = ?, log_index = ?, problem = NULL, checked_at = ? WHERE id = ?', receipt.blockNumber, receipt.blockHash, transfer.logIndex, now, row.id);
  }
  if (receipt.blockNumber > final) sql.run('UPDATE billing_payments SET checked_at = ? WHERE id = ?', now, row.id);
  else await finalizePayment(row.id, receipt);
}

// Follows every payment that isn't settled yet against the chain as it is now. A named
// transaction that gets mined becomes payments (or says why it can't). A transfer whose block
// changed in a reorg takes the new block and waits again; one that vanished is kept, without a
// block, until it is mined again or PLAN_LATE_DAYS pass. A transfer whose block is final is
// counted.
export default async function confirmPayments(now = Date.now()) {
  const rows = sql.all("SELECT * FROM billing_payments WHERE status IN ('seen', 'confirming') ORDER BY created_at");
  if (!rows.length) return;
  const final = await finalizedBlock();

  for (const row of rows) {
    try {
      await follow(row, await readReceipt(row.tx_hash), final, now);
    } catch (err) {
      // one odd row or one refused receipt mustn't hold up the rest; it's tried again next minute
      log.error('billing', `payment check for ${row.id} failed`, err.message);
    }
  }
}
