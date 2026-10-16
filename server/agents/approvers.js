import sql from '../db/sql.js';

// Who may approve or decline an agent's request: any admin, plus the person the task belongs to.
// An agent never approves anything, its own requests least of all.
export default function approvers(task) {
  const ids = new Set(sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0 AND kind = 'human'").map((u) => u.id));
  if (task?.assigneeId && sql.get("SELECT 1 FROM users WHERE id = ? AND kind = 'human' AND deactivated = 0", task.assigneeId)) ids.add(task.assigneeId);
  return ids;
}
