// Fixes from a review of the votes. Nullifiers and voting keys are now accepted only as
// canonical decimals below the field order, since "0" + n verified like n and counted twice.
// No honest browser ever sent another spelling, so held ballots and the ballots of open votes
// written any other way go, and so do voting keys: their owners register again on next unlock.
//
// A weighted vote's snapshot also keeps each wallet's holdings as read, so the audit file can
// show what a voter held then rather than the wallets they have linked since.
//
// A ballot may only be proven against the current voter list, or one replaced in the last few
// minutes, so each root notes when it was replaced. Roots of open votes count as current until
// their list next changes.
//
// A held anonymous ballot remembers which choices its voter changed away from in its hour, so a
// copy of one of those earlier ballots can't be sent again to undo the change.
const odd = (column) => `(${column} GLOB '0?*' OR length(${column}) > 77 OR (length(${column}) = 77 AND ${column} >= '21888242871839275222246405745257275088548364400416034343698204186575808495617'))`;

const voteReview = `
  DELETE FROM held_ballots WHERE ${odd('nullifier')};
  DELETE FROM anonymous_ballots WHERE ${odd('nullifier')} AND proposal_id IN (SELECT id FROM proposals WHERE closed_at IS NULL);
  DELETE FROM encrypted_ballots WHERE ${odd('nullifier')} AND proposal_id IN (SELECT id FROM proposals WHERE closed_at IS NULL);
  UPDATE users SET semaphore_commitment = NULL WHERE semaphore_commitment IS NOT NULL AND ${odd('semaphore_commitment')};

  ALTER TABLE proposal_roots ADD COLUMN replaced_at INTEGER;
  ALTER TABLE held_ballots ADD COLUMN replaced TEXT NOT NULL DEFAULT '';

  CREATE TABLE proposal_wallet_power (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nox TEXT NOT NULL,
    staked TEXT NOT NULL,
    zsp INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, address)
  );
`;

export default voteReview;
