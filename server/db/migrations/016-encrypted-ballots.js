// Anonymous weighted votes: encrypted ballots, three trustees who share the decryption key
// (any two can decrypt the totals, none alone can), and the census leaves carry each power.
const encryptedBallots = `
  ALTER TABLE proposal_voters ADD COLUMN power TEXT;
  ALTER TABLE proposals ADD COLUMN public_key TEXT;

  CREATE TABLE proposal_trustees (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    dealing TEXT,
    dealt_at INTEGER,
    partial TEXT,
    partial_at INTEGER,
    PRIMARY KEY (proposal_id, position)
  );

  CREATE TABLE encrypted_ballots (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    nullifier TEXT NOT NULL,
    ciphertexts TEXT NOT NULL,
    proof TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, nullifier)
  );
`;

export default encryptedBallots;
