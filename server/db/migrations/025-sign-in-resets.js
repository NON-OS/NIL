// Sign-in resets. An admin issues a one-time link that lets a member who lost their wallets
// link a new one to the same account. Resetting an owner can wait on a second admin's approval,
// so a request may exist before its link does. Only the link's hash is stored.
// sign_in_audit records each step, and every wallet linked or removed, by account id only.
const signInResets = `
  CREATE TABLE sign_in_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE,
    requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    issued_at INTEGER,
    used_at INTEGER,
    closed_at INTEGER
  );
  CREATE INDEX sign_in_resets_user ON sign_in_resets(user_id);

  CREATE TABLE sign_in_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    subject_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
`;

export default signInResets;
