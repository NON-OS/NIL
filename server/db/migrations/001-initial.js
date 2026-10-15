// The original schema.
const initial = `
  CREATE TABLE workspace (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    task_prefix TEXT NOT NULL DEFAULT 'NON',
    task_seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    color TEXT NOT NULL,
    deactivated INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE invites (
    token_hash TEXT PRIMARY KEY,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at INTEGER
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lead_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'on_track',
    target_date TEXT,
    metric_name TEXT NOT NULL DEFAULT '',
    metric_start REAL,
    metric_current REAL,
    metric_target REAL,
    position REAL NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER NOT NULL DEFAULT 0,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    due_date TEXT,
    start_date TEXT,
    estimate INTEGER,
    labels TEXT NOT NULL DEFAULT '[]',
    checklist TEXT NOT NULL DEFAULT '[]',
    recurrence TEXT,
    position REAL NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    deleted_at INTEGER
  );
  CREATE INDEX tasks_status ON tasks(status);
  CREATE INDEX tasks_assignee ON tasks(assignee_id);
  CREATE INDEX tasks_project ON tasks(project_id);
  CREATE INDEX tasks_deleted ON tasks(deleted_at);

  CREATE TABLE watchers (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
  );

  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER
  );
  CREATE INDEX comments_task ON comments(task_id, created_at);

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX attachments_task ON attachments(task_id);

  CREATE TABLE activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX activity_task ON activity(task_id, created_at);

  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    data TEXT NOT NULL DEFAULT '{}',
    read_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX notifications_user ON notifications(user_id, id);

  CREATE TABLE focus (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, task_id)
  );
  `;

export default initial;
