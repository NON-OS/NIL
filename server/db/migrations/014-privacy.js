// Private payouts to stealth addresses, and anonymous votes proven with Semaphore.
const privacy = `
  ALTER TABLE users ADD COLUMN stealth_meta TEXT;
  ALTER TABLE users ADD COLUMN semaphore_commitment TEXT;
  CREATE UNIQUE INDEX users_semaphore ON users(semaphore_commitment) WHERE semaphore_commitment IS NOT NULL;

  ALTER TABLE payments ADD COLUMN stealth_ephemeral TEXT;
  ALTER TABLE payments ADD COLUMN stealth_view_tag INTEGER;
  ALTER TABLE payments ADD COLUMN announce_tx TEXT;
  ALTER TABLE payments ADD COLUMN announced_at INTEGER;

  ALTER TABLE proposals ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0;

  -- the voter group of an anonymous vote, in tree order; a removed voter's leaf becomes empty
  CREATE TABLE proposal_voters (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    commitment TEXT NOT NULL,
    removed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (proposal_id, position)
  );

  -- every root the group has had; proofs against a revoked root are refused
  CREATE TABLE proposal_roots (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    root TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, root)
  );

  CREATE TABLE anonymous_ballots (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL,
    choice INTEGER NOT NULL,
    proof TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, nullifier)
  );
`;

export default privacy;
