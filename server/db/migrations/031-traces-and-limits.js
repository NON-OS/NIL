// Admins can close a listed bounty to new applications without taking it off the board. A
// comment's excerpt leaves people's notifications when the comment is edited, deleted or
// erased, which looks notifications up by task. Run log steps and stored idempotent replies
// name the task they quote, and the audit trail is looked up by task, so all three can be
// wiped when a task turns private or is erased.
const tracesAndLimits = `
  ALTER TABLE tasks ADD COLUMN applications_closed_at INTEGER;
  CREATE INDEX IF NOT EXISTS notifications_task ON notifications(task_id);

  ALTER TABLE agent_steps ADD COLUMN task_id TEXT;
  ALTER TABLE agent_idempotency ADD COLUMN task_id TEXT;
  CREATE INDEX IF NOT EXISTS agent_steps_task ON agent_steps(task_id) WHERE task_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_idempotency_task ON agent_idempotency(task_id) WHERE task_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS agent_audit_task ON agent_audit(task_id);
`;

export default tracesAndLimits;
