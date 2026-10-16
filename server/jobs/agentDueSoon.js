import sql from '../db/sql.js';
import config from '../config.js';
import calendar from '../lib/calendar.js';
import publicWorkspace from '../services/publicWorkspace.js';
import agentSettings from '../agents/agentSettings.js';
import enqueueDelivery from '../agents/webhooks/enqueueDelivery.js';

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Runs every few minutes: tells agents, once per task and due date, that work assigned to them
// is due within the configured window. Moving the due date sends a fresh notice.
export default function agentDueSoon() {
  if (!agentSettings.enabled()) return;
  const today = calendar.today();
  const horizon = localDate(new Date(Date.now() + config.agents.dueSoonHours * 3_600_000));
  const ws = publicWorkspace();
  const rows = sql.all(
    `SELECT t.id, t.number, t.due_date, t.assignee_id FROM tasks t JOIN users u ON u.id = t.assignee_id
     WHERE u.kind = 'agent' AND u.deactivated = 0 AND t.deleted_at IS NULL AND t.private = 0
       AND t.status NOT IN ('done', 'canceled') AND t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?`,
    today, horizon,
  );
  for (const t of rows) {
    const fresh = sql.run('INSERT OR IGNORE INTO agent_due_notices (agent_id, task_id, due_date) VALUES (?, ?, ?)', t.assignee_id, t.id, t.due_date);
    if (fresh.changes) enqueueDelivery(t.assignee_id, 'task.due_soon', { task: { id: t.id, key: `${ws.taskPrefix}-${t.number}` }, due: t.due_date });
  }
}
