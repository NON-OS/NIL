// Wallets become the only way in, so email addresses, passwords and passkeys go.
const walletOnly = {
  rebuild: true,
  sql: `
  CREATE TABLE users_next (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member',
    color TEXT NOT NULL,
    deactivated INTEGER NOT NULL DEFAULT 0,
    share_wallet INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER
  );
  INSERT INTO users_next (id, name, title, role, color, deactivated, share_wallet, created_at, last_seen_at)
    SELECT id, name, title, role, color, deactivated, share_wallet, created_at, last_seen_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_next RENAME TO users;
  DELETE FROM credentials WHERE kind != 'wallet';
  UPDATE invites SET email = NULL;
  `,
};

export default walletOnly;
