// NOX holders can join without an invite, and the team can decide things with signed votes.
const holdersAndVotes = `
  ALTER TABLE users ADD COLUMN joined_via TEXT NOT NULL DEFAULT 'invite';
  UPDATE users SET joined_via = 'setup' WHERE role = 'owner';

  CREATE TABLE proposals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL,
    weighting TEXT NOT NULL DEFAULT 'equal',
    sealed INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    closes_at INTEGER NOT NULL,
    closed_at INTEGER,
    result TEXT
  );
  CREATE INDEX proposals_open ON proposals(closed_at, closes_at);

  CREATE TABLE votes (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    choice INTEGER NOT NULL,
    weight TEXT NOT NULL,
    final_weight TEXT,
    address TEXT NOT NULL,
    message TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, user_id)
  );
`;

export default holdersAndVotes;
