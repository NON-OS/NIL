import sql from '../db/sql.js';
import readAnnouncement from '../chain/readAnnouncement.js';
import finalizedBlock from '../chain/finalizedBlock.js';
import publishTask from './publishTask.js';

// A stealth payout counts as announced once the chain carries an ERC-5564 announcement with
// its address, one-time public key and view tag. From then on the payee can find and spend it
// with their wallet alone. It never decides whether the bounty was paid: the transfer does.
export default async function checkAnnouncement(id) {
  const payment = sql.get('SELECT * FROM payments WHERE id = ?', id);
  if (!payment?.stealth_ephemeral || payment.announced_at || !payment.announce_tx) return;
  const found = await readAnnouncement(payment.announce_tx);
  // like the transfer, the announcement only counts once its block is final
  if (found.state !== 'mined' || found.blockNumber > (await finalizedBlock())) return;

  const tag = payment.stealth_view_tag.toString(16).padStart(2, '0');
  const matches = found.announcements.some(
    (a) => a.schemeId === 1 && a.stealthAddress === payment.to_address && a.ephemeralPublicKey === payment.stealth_ephemeral && a.metadata?.slice(2, 4) === tag,
  );
  if (!matches) return;
  const { changes } = sql.run('UPDATE payments SET announced_at = ?, announce_block_hash = ? WHERE id = ? AND announced_at IS NULL', Date.now(), found.blockHash, id);
  if (changes && payment.task_id) publishTask(payment.task_id);
}
