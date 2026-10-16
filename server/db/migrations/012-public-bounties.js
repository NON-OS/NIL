// Public bounties: teams can list a task for outsiders, who apply by signing with a wallet.
const publicBounties = `
  ALTER TABLE tasks ADD COLUMN listed_at INTEGER;

  CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    name TEXT NOT NULL,
    pitch TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    decided_at INTEGER,
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX applications_task ON applications(task_id, status);
  CREATE UNIQUE INDEX applications_once ON applications(task_id, address);
`;

export default publicBounties;
