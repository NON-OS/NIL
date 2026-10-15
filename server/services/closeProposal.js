import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import tally from './tally.js';
import holdings from './holdings.js';

// Closes a vote and freezes the result. With NOX weighting each vote counts the smaller of
// the balance when cast and the balance now, so tokens passed around mid-vote count once.
export default async function closeProposal(id) {
  const proposal = sql.get('SELECT * FROM proposals WHERE id = ? AND closed_at IS NULL', id);
  if (!proposal) return;
  if (proposal.weighting === 'nox') {
    for (const v of sql.all('SELECT user_id, weight FROM votes WHERE proposal_id = ?', id)) {
      const now = await holdings(v.user_id);
      const cast = BigInt(v.weight);
      sql.run('UPDATE votes SET final_weight = ? WHERE proposal_id = ? AND user_id = ?', String(now < cast ? now : cast), id, v.user_id);
    }
  }
  sql.tx(() => {
    const votes = sql.all('SELECT choice, COALESCE(final_weight, weight) AS weight FROM votes WHERE proposal_id = ?', id);
    const result = tally({ ...proposal, result: null });
    result.totals = result.totals.map(() => 0n);
    for (const v of votes) result.totals[v.choice] += BigInt(v.weight);
    result.totals = result.totals.map(String);
    sql.run('UPDATE proposals SET closed_at = ?, result = ? WHERE id = ? AND closed_at IS NULL', Date.now(), JSON.stringify(result), id);
  });
  hub.broadcast({ type: 'proposals' });
}
