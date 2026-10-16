// Sharing: guests limited to chosen projects, invites that carry those projects, and
// read-only share links stored as hashes.
const sharing = `
  CREATE TABLE project_guests (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE INDEX project_guests_user ON project_guests(user_id);

  ALTER TABLE invites ADD COLUMN project_ids TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE share_links (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    last_viewed_at INTEGER,
    views INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX share_links_target ON share_links(kind, target_id);
`;

export default sharing;
