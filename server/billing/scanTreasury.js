import sql from '../db/sql.js';
import config from '../config.js';
import headBlock from '../chain/headBlock.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import transferLogs from '../chain/transferLogs.js';
import billingState from './billingState.js';
import recordTransfer from './recordTransfer.js';

const DAY = 86_400_000;

// Looks through the treasury's incoming transfers for this workspace's invoices, token by
// token, from whoever sent them. Blocks that aren't final yet are read again on every run, so a
// payment that a reorg moves into an already-read block is still found; only final blocks are
// marked as done.
export default async function scanTreasury(now = Date.now()) {
  const watched = sql.all(
    'SELECT a.token, MIN(i.start_block) AS start FROM billing_invoices i JOIN billing_amounts a ON a.invoice_id = i.id WHERE i.expires_at > ? GROUP BY a.token',
    now - config.billing.lateDays * DAY,
  );
  if (!watched.length) return;
  const [head, final] = await Promise.all([headBlock(), finalizedBlock()]);
  const cursors = billingState.get('scan', {});

  for (const { token, start } of watched) {
    const from = Math.max(start, (cursors[token] ?? 0) + 1);
    for (let at = from; at <= head; at += config.billing.logBlocks) {
      const to = Math.min(head, at + config.billing.logBlocks - 1);
      for (const transfer of await transferLogs(token, config.plan.treasury, at, to)) recordTransfer(transfer);
    }
    cursors[token] = Math.max(cursors[token] ?? 0, Math.min(final, head));
  }
  billingState.set('scan', cursors);
}
