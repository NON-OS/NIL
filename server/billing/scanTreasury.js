import sql from '../db/sql.js';
import config from '../config.js';
import headBlock from '../chain/headBlock.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import transferLogs from '../chain/transferLogs.js';
import billingState from './billingState.js';
import recordTransfer from './recordTransfer.js';
import scanGaps from './scanGaps.js';

const DAY = 86_400_000;
// the head moves on during a scan, so it keeps this many blocks inside the node's window
const MARGIN = 100;

// Looks through the treasury's incoming transfers for this workspace's invoices, token by
// token, from whoever sent them. Blocks that aren't final yet are read again on every run, so a
// payment that a reorg moves into an already-read block is still found; only final blocks are
// marked as done.
//
// A node only serves logs so far back (NOX_LOG_HISTORY_BLOCKS; the public node keeps 10,000
// blocks, about 33 hours). When the scan has fallen further behind than that, after a long
// outage, the blocks it can no longer read are skipped and remembered, so the invoices they
// touch tell admins to name any transaction sent then, instead of the scan asking for them
// forever. Each token keeps its own place: one whose scan fails is tried again next run from
// where it got to, and the others carry on.
export default async function scanTreasury(now = Date.now()) {
  const watched = sql.all(
    'SELECT a.token, MIN(i.start_block) AS start FROM billing_invoices i JOIN billing_amounts a ON a.invoice_id = i.id WHERE i.expires_at > ? GROUP BY a.token',
    now - config.billing.lateDays * DAY,
  );
  if (!watched.length) return;
  const [head, final] = await Promise.all([headBlock(), finalizedBlock()]);
  const cursors = billingState.get('scan', {});
  const oldest = Math.max(0, head - config.nox.logHistoryBlocks + MARGIN);
  let failure = null;

  for (const { token, start } of watched) {
    let from = Math.max(start, (cursors[token] ?? 0) + 1);
    if (from < oldest) {
      scanGaps.add({ token, from, to: oldest - 1, at: now });
      cursors[token] = oldest - 1;
      from = oldest;
    }
    try {
      for (let at = from; at <= head; at += config.billing.logBlocks) {
        const to = Math.min(head, at + config.billing.logBlocks - 1);
        for (const transfer of await transferLogs(token, config.plan.treasury, at, to)) recordTransfer(transfer);
        cursors[token] = Math.max(cursors[token] ?? 0, Math.min(final, to));
      }
    } catch (err) {
      failure ??= err;
    }
  }
  billingState.set('scan', cursors);
  if (failure) throw failure;
}
