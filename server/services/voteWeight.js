import sql from '../db/sql.js';

// One person, one vote, or the voting power snapshotted when the vote opened.
export default function voteWeight(userId, proposal) {
  if (proposal.weighting !== 'power') return '1';
  return sql.get('SELECT power FROM proposal_power WHERE proposal_id = ? AND user_id = ?', proposal.id, userId)?.power ?? '0';
}
