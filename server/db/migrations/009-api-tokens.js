// Personal access keys for connecting AI assistants and scripts. Only a hash is stored.
const apiTokens = `
  CREATE TABLE api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    scope TEXT NOT NULL DEFAULT 'read',
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    last_used_at INTEGER
  );
  CREATE INDEX api_tokens_user ON api_tokens(user_id);
`;

export default apiTokens;
