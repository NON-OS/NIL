// Agents: non-human members that work through the same tools as people. An agent is a users row
// with kind = 'agent' and no wallet, so it can never sign in; its settings, webhook, runs,
// approvals and audit trail live in the tables below. Nothing here depends on other migrations
// added after 017.
const agents = `
  ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'human';
  ALTER TABLE activity ADD COLUMN acting_for TEXT REFERENCES users(id) ON DELETE SET NULL;

  CREATE TABLE agents (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    access TEXT NOT NULL DEFAULT 'read',
    all_projects INTEGER NOT NULL DEFAULT 0,
    tools TEXT NOT NULL DEFAULT '[]',
    runner TEXT NOT NULL DEFAULT 'external',
    model TEXT,
    endpoint TEXT,
    api_key_ct TEXT,
    done_status TEXT,
    max_steps INTEGER,
    max_run_tokens INTEGER,
    max_day_tokens INTEGER,
    rate_limit INTEGER,
    price_in REAL,
    price_out REAL,
    paused_at INTEGER,
    removed_at INTEGER,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE agent_projects (
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    PRIMARY KEY (agent_id, project_id)
  );
  CREATE INDEX agent_projects_project ON agent_projects(project_id);

  CREATE TABLE agent_webhooks (
    agent_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret_ct TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    failures INTEGER NOT NULL DEFAULT 0,
    disabled_at INTEGER,
    disabled_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE webhook_deliveries (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    last_status INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    delivered_at INTEGER
  );
  CREATE INDEX webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at);
  CREATE INDEX webhook_deliveries_agent ON webhook_deliveries(agent_id, created_at);

  CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    trigger TEXT NOT NULL,
    acting_for TEXT REFERENCES users(id) ON DELETE SET NULL,
    context TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    run_after INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    steps INTEGER NOT NULL DEFAULT 0,
    summary TEXT,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX agent_runs_queue ON agent_runs(status, run_after);
  CREATE INDEX agent_runs_agent ON agent_runs(agent_id, created_at);
  CREATE INDEX agent_runs_task ON agent_runs(task_id, created_at);

  CREATE TABLE agent_steps (
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    tool TEXT,
    input TEXT,
    output TEXT,
    ok INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, seq)
  );

  CREATE TABLE agent_approvals (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    acting_for TEXT REFERENCES users(id) ON DELETE SET NULL,
    tool TEXT NOT NULL,
    input TEXT NOT NULL,
    reasons TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at INTEGER,
    result TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX agent_approvals_task ON agent_approvals(task_id, created_at);
  CREATE INDEX agent_approvals_status ON agent_approvals(status, created_at);

  CREATE TABLE agent_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    acting_for TEXT REFERENCES users(id) ON DELETE SET NULL,
    via TEXT NOT NULL,
    action TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    run_id TEXT,
    outcome TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX agent_audit_agent ON agent_audit(agent_id, id);

  CREATE TABLE agent_idempotency (
    principal TEXT NOT NULL,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status INTEGER NOT NULL,
    response TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (principal, key)
  );

  CREATE TABLE agent_writes (
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX agent_writes_agent ON agent_writes(agent_id, created_at);

  CREATE TABLE agent_due_notices (
    agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    PRIMARY KEY (agent_id, task_id, due_date)
  );
`;

export default agents;
