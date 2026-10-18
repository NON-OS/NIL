// Fixes from a review of the votes. Nullifiers and voting keys are now accepted only as
// canonical decimals below the field order, since "0" + n verified like n and counted twice.
// No honest browser ever sent another spelling, so held ballots and the ballots of open votes
// written any other way go, and so do voting keys: their owners register again on next unlock.
const odd = (column) => `(${column} GLOB '0?*' OR length(${column}) > 77 OR (length(${column}) = 77 AND ${column} >= '21888242871839275222246405745257275088548364400416034343698204186575808495617'))`;

const voteReview = `
  DELETE FROM held_ballots WHERE ${odd('nullifier')};
  DELETE FROM anonymous_ballots WHERE ${odd('nullifier')} AND proposal_id IN (SELECT id FROM proposals WHERE closed_at IS NULL);
  DELETE FROM encrypted_ballots WHERE ${odd('nullifier')} AND proposal_id IN (SELECT id FROM proposals WHERE closed_at IS NULL);
  UPDATE users SET semaphore_commitment = NULL WHERE semaphore_commitment IS NOT NULL AND ${odd('semaphore_commitment')};
`;

export default voteReview;
