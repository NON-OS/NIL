// Everyday tools: private tasks, a personal time log, and reminders.
const everyday = `
  ALTER TABLE tasks ADD COLUMN private INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX time_entries_user ON time_entries(user_id, started_at);
  CREATE UNIQUE INDEX time_entries_running ON time_entries(user_id) WHERE ended_at IS NULL;

  CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    note TEXT NOT NULL DEFAULT '',
    remind_at INTEGER NOT NULL,
    sent_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX reminders_due ON reminders(sent_at, remind_at);
`;

export default everyday;
