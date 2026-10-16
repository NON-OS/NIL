// Passkey and wallet credentials, signed work receipts, and workspace settings.
const identityAndProofs = `
  CREATE TABLE credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    external_id TEXT NOT NULL UNIQUE,
    public_key TEXT,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT NOT NULL DEFAULT '[]',
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX credentials_user ON credentials(user_id);

  CREATE TABLE receipts (
    id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL UNIQUE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    title TEXT,
    salt TEXT,
    body TEXT NOT NULL,
    hash TEXT NOT NULL,
    signature TEXT NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX receipts_user ON receipts(user_id, seq);
  CREATE INDEX receipts_task ON receipts(task_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `;

export default identityAndProofs;
