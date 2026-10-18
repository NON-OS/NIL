// Admins can close a listed bounty to new applications without taking it off the board. A
// comment's excerpt leaves people's notifications when the comment is edited, deleted or
// erased, which looks notifications up by task.
const tracesAndLimits = `
  ALTER TABLE tasks ADD COLUMN applications_closed_at INTEGER;
  CREATE INDEX IF NOT EXISTS notifications_task ON notifications(task_id);
`;

export default tracesAndLimits;
