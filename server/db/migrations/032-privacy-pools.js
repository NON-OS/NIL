// Bounties paid from a Privacy Pools pool. A payment and the intent before it say which route
// paid ('pool' or null for a wallet) and which pool, and what the relayer kept. The team's pool
// account is one key, sealed in admins' browsers to each admin who holds it, plus the team's
// notes, encrypted under that key. The server can open neither.
const privacyPools = `
  ALTER TABLE payment_intents ADD COLUMN via TEXT;
  ALTER TABLE payment_intents ADD COLUMN pool_address TEXT;
  ALTER TABLE payments ADD COLUMN via TEXT;
  ALTER TABLE payments ADD COLUMN pool_address TEXT;
  ALTER TABLE payments ADD COLUMN relay_fee TEXT;

  CREATE TABLE pool_account (
    id TEXT PRIMARY KEY,
    key_tag TEXT NOT NULL,
    start_block INTEGER NOT NULL,
    notes TEXT NOT NULL,
    notes_rev INTEGER NOT NULL DEFAULT 1,
    notes_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE pool_account_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    wrapped TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
`;

export default privacyPools;
