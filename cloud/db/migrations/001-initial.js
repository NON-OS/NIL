// The control plane's own records. Nothing here comes from inside a workspace: no task, no
// member, no message. The owner is the one wallet address that signed up, kept so the operator
// can tell who a workspace belongs to; it is cleared when the workspace is deleted.
const initial = `
  CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner TEXT,
    state TEXT NOT NULL CHECK (state IN ('provisioning', 'starting', 'active', 'stopped', 'suspended', 'upgrading', 'restoring', 'deleting', 'deleted', 'failed')),
    image TEXT NOT NULL,
    plan TEXT NOT NULL,
    volume TEXT NOT NULL,
    setup_token TEXT,
    claimed_at INTEGER,
    checkpoint_image TEXT,
    checkpoint_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    suspended_at INTEGER,
    suspend_reason TEXT,
    delete_after INTEGER,
    deleted_at INTEGER,
    last_healthy_at INTEGER
  );
  -- a name belongs to one live workspace; deleted rows stay behind to quarantine the name
  CREATE UNIQUE INDEX workspaces_live_name ON workspaces(name) WHERE state != 'deleted';
  CREATE INDEX workspaces_owner ON workspaces(owner);

  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    workspace_id TEXT,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT
  );
  CREATE INDEX events_workspace ON events(workspace_id, at);

  CREATE TABLE backups (
    id INTEGER PRIMARY KEY,
    workspace_id TEXT,
    kind TEXT NOT NULL,
    location TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX backups_workspace ON backups(workspace_id, at);

  CREATE TABLE usage (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    disk_bytes INTEGER,
    members INTEGER,
    measured_at INTEGER NOT NULL
  );
`;

export default initial;
