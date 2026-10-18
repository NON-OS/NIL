// Anonymous ballots wait here until the hour they arrived in has ended, then join the count
// together, in random order, stamped with that hour. Their exact arrival time is never stored,
// so it can't be matched against the signed-in requests around it, and the table keeps no
// arrival order either (no rowid; rows sort by nullifier). Ballots and voter-tree roots already
// stored lose their exact times the same way.
const heldBallots = `
  CREATE TABLE held_ballots (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL,
    ballot TEXT NOT NULL,
    hour INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, nullifier)
  ) WITHOUT ROWID;

  UPDATE anonymous_ballots SET created_at = created_at - created_at % 3600000;
  UPDATE encrypted_ballots SET created_at = created_at - created_at % 3600000;
  UPDATE proposal_roots SET created_at = created_at - created_at % 3600000;
`;

export default heldBallots;
