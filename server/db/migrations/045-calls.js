// Calls that outlive a restart and work across server processes. Only what a call needs while
// it goes on: who started it, who is in it or being rung, the tab each person joined from and
// which server process holds their connection. Nothing is kept once a call ends, and a call
// nobody refreshes expires on its own. What's said or shown never reaches the server.
const calls = `
  CREATE TABLE calls (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('person', 'project')),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    started_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    -- 'mesh' browser to browser, or 'sfu' once the call is too big for that
    mode TEXT NOT NULL DEFAULT 'mesh' CHECK (mode IN ('mesh', 'sfu')),
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX calls_expiry ON calls(expires_at);
  CREATE INDEX calls_started_by ON calls(started_by);
  CREATE INDEX calls_project ON calls(project_id);

  CREATE TABLE call_people (
    call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- asked in (may join), being rung, or in the call
    state TEXT NOT NULL CHECK (state IN ('allowed', 'ringing', 'member')),
    ring_until INTEGER,
    session TEXT,
    joined_at INTEGER,
    instance TEXT,
    connected INTEGER NOT NULL DEFAULT 0,
    seen_at INTEGER,
    PRIMARY KEY (call_id, user_id)
  );
  CREATE INDEX call_people_user ON call_people(user_id);

  -- who may not ring whom: a person blocked, or '*' for nobody at all while they're not taking calls
  CREATE TABLE call_blocks (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL,
    PRIMARY KEY (user_id, blocked_id)
  );

  -- server processes sharing this database, and the call messages one passes to the others,
  -- kept for seconds
  CREATE TABLE call_instances (
    id TEXT PRIMARY KEY,
    seen_at INTEGER NOT NULL
  );

  CREATE TABLE call_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('user', 'member', 'team')),
    user_id TEXT,
    call_id TEXT,
    session TEXT,
    body TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`;

export default calls;
