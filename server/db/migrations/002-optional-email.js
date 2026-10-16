const optionalEmail = {
  rebuild: true,
  // email and password become optional so people can join with a passkey or wallet only
  sql: `
  CREATE TABLE users_next (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    color TEXT NOT NULL,
    deactivated INTEGER NOT NULL DEFAULT 0,
    share_wallet INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER
  );
  INSERT INTO users_next (id, email, name, title, password_hash, role, color, deactivated, created_at, last_seen_at)
    SELECT id, email, name, title, password_hash, role, color, deactivated, created_at, last_seen_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_next RENAME TO users;
  `,
};

export default optionalEmail;
