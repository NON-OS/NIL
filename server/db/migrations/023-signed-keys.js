// Encryption keys are published with a wallet signature, and each member's identity is stored
// wrapped once per linked wallet so any of them unlocks it. Keys published before this were bare
// public keys that nobody can check, so they go: everyone signs a fresh key on their next unlock.
// Payout and voting keys now come from that identity instead of their own signature, so their
// old public halves go as well. Trustee dealings gain a commit step and a record of each
// trustee's check of the shares dealt to them.
const signedKeys = `
  DROP TABLE encryption_keys;
  CREATE TABLE encryption_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    signing_key TEXT NOT NULL,
    address TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE identity_wraps (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT NOT NULL REFERENCES credentials(external_id) ON DELETE CASCADE,
    nonce TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    wrapped TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, address)
  );

  UPDATE users SET stealth_meta = NULL, semaphore_commitment = NULL;

  ALTER TABLE proposal_trustees ADD COLUMN commitment TEXT;
  ALTER TABLE proposal_trustees ADD COLUMN shares_check TEXT;
`;

export default signedKeys;
