// End-to-end encrypted docs. The server keeps only ciphertext and per-person wrapped keys;
// titles are encrypted too, so a copy of the database reveals nothing about what's written.
const encryptedDocs = `
  CREATE TABLE encryption_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE docs (
    id TEXT PRIMARY KEY,
    title_ct TEXT NOT NULL,
    body_ct TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    audience TEXT NOT NULL DEFAULT 'team',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE doc_keys (
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (doc_id, user_id)
  );
  CREATE INDEX doc_keys_user ON doc_keys(user_id);

  CREATE TABLE doc_revisions (
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title_ct TEXT NOT NULL,
    body_ct TEXT NOT NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (doc_id, version)
  );
`;

export default encryptedDocs;
