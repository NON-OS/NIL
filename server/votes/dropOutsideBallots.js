import sql from '../db/sql.js';

// A member's ballot stands for all their wallets, so a ballot one of those wallets cast from a
// public vote's page before it was theirs gives way to it rather than counting twice.
export default function dropOutsideBallots(proposalId, userId) {
  sql.run(
    `DELETE FROM outside_votes WHERE proposal_id = ? AND address IN (
       SELECT address FROM proposal_wallet_power WHERE proposal_id = ? AND user_id = ?
       UNION SELECT external_id FROM credentials WHERE kind = 'wallet' AND user_id = ?)`,
    proposalId, proposalId, userId, userId,
  );
}
