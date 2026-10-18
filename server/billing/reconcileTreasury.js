import sql from '../db/sql.js';
import config from '../config.js';
import headBlock from '../chain/headBlock.js';
import transferLogs from '../chain/transferLogs.js';
import readReceipt from '../chain/readReceipt.js';
import billingState from './billingState.js';
import recordTransfer from './recordTransfer.js';
import attachReceipt from './attachReceipt.js';
import blockFees from './blockFees.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
// stays this many blocks inside the node's log window, as the scan does, since the head moves on
const MARGIN = 100;

// Saves what a dropped payment's transaction holds now, if it has been mined after all.
async function recheck(row, feeFor) {
  const receipt = await readReceipt(row.tx_hash);
  if (receipt.state !== 'mined') return;
  const transfers = receipt.transfers.map((t) => ({ ...t, txHash: row.tx_hash, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash }));
  // a named transaction that never showed up: it pays the invoice it was named for, or says why not
  if (row.log_index === -1) return attachReceipt(row, receipt, { feeBps: transfers.length ? await feeFor(transfers[0]) : 0 });
  for (const transfer of transfers) recordTransfer(transfer, { feeBps: await feeFor(transfer) });
}

// Once every PLAN_RECONCILE_MINUTES, goes over the recent past again instead of trusting what the
// minute-by-minute watch already did: every transfer to the treasury in the last
// PLAN_RECONCILE_BLOCKS blocks, whatever the scan cursor says, and the receipt of every payment
// dropped in the last PLAN_RECONCILE_DAYS. A transfer the scan missed (a node that answered a log
// query short, say) or one that came back after it was given up on is saved then, and the watch
// follows it to finality like any other. Saving is idempotent, so a run never counts anything
// twice, and a token or a row that fails doesn't stop the rest.
export default async function reconcileTreasury(now = Date.now()) {
  const last = billingState.get('reconciledAt', null);
  if (last !== null && now - last < config.billing.reconcileMinutes * MINUTE) return;
  const watched = sql.all(
    'SELECT a.token, MIN(i.start_block) AS start FROM billing_invoices i JOIN billing_amounts a ON a.invoice_id = i.id WHERE i.expires_at > ? GROUP BY a.token',
    now - config.billing.lateDays * DAY,
  );
  const dropped = sql.all("SELECT * FROM billing_payments WHERE status = 'dropped' AND created_at > ? ORDER BY created_at", now - config.billing.reconcileDays * DAY);
  if (!watched.length && !dropped.length) return;
  // a node that is down costs this one call a minute, and the run happens as soon as it is back
  const head = await headBlock();
  billingState.set('reconciledAt', now);
  const feeFor = blockFees();
  let failure = null;

  if (watched.length) {
    const from = head - Math.min(config.billing.reconcileBlocks, config.nox.logHistoryBlocks - MARGIN);
    for (const { token, start } of watched) {
      try {
        for (let at = Math.max(start, from, 0); at <= head; at += config.billing.logBlocks) {
          const to = Math.min(head, at + config.billing.logBlocks - 1);
          for (const transfer of await transferLogs(token, config.plan.treasury, at, to)) recordTransfer(transfer, { feeBps: await feeFor(transfer) });
        }
      } catch (err) {
        failure ??= err;
      }
    }
  }
  for (const row of dropped) {
    try {
      await recheck(row, feeFor);
    } catch (err) {
      failure ??= err;
    }
  }
  if (failure) throw failure;
}
