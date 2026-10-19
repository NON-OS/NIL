import sql from '../db/sql.js';

// Every signed ballot in a vote, members' and outside wallets' together, oldest first. A member's
// carries their user id; a wallet that belongs to no member, on a public vote, a null one.
export default function ballotRows(proposalId) {
  const members = sql.all('SELECT user_id, address, choice, weight, created_at FROM votes WHERE proposal_id = ?', proposalId);
  const outside = sql.all('SELECT NULL AS user_id, address, choice, weight, created_at FROM outside_votes WHERE proposal_id = ?', proposalId);
  return [...members, ...outside]
    .sort((a, b) => a.created_at - b.created_at)
    .map((v) => ({ userId: v.user_id, address: v.address, choice: v.choice, weight: v.weight, castAt: v.created_at }));
}
