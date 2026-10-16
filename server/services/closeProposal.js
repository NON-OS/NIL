import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import tally from './tally.js';
import heldBallots from '../votes/heldBallots.js';

// Closes a vote and freezes the result, so erasing an account later can't rewrite a decision.
// Weighted votes already count a snapshot taken when they opened, so nothing moves at close.
export default async function closeProposal(id) {
  const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND closed_at IS NULL', id);
  if (!proposal) return;
  // the last hour's anonymous ballots are still held; at the close they all count
  heldBallots.release({ proposalId: id, all: true });
  // an encrypted vote closes without a result; it arrives when two trustees decrypt the totals
  const encrypted = proposal.anonymous && proposal.weighting === 'power';
  const result = encrypted ? null : JSON.stringify(tally({ ...proposal, result: null }));
  sql.run('UPDATE proposals SET closed_at = ?, result = ? WHERE id = ? AND closed_at IS NULL', Date.now(), result, id);
  hub.broadcast({ type: 'proposals' });
}
