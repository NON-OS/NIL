import sql from '../../db/sql.js';
import calendar from '../../lib/calendar.js';
import updateTask from '../../services/updateTask.js';
import publishUser from '../../services/publishUser.js';
import worker from '../runner/worker.js';
import agentScope from '../agentScope.js';
import audit from '../audit.js';

// Deleting an agent removes everything that lets it act or holds its secrets: keys, webhook,
// queued work, instructions, model key and pending requests. Its open tasks go back to
// unassigned so nothing waits on a teammate that's gone. The member row stays, deactivated, so
// the history and audit trail keep saying who did what.
export default function removeAgent(agentId, admin) {
  worker.cancelAgent(agentId, 'The agent was deleted.');
  const open = sql.all("SELECT id FROM tasks WHERE assignee_id = ? AND deleted_at IS NULL AND status NOT IN ('done', 'canceled')", agentId).map((r) => r.id);
  for (const taskId of open) updateTask(admin, taskId, { assigneeId: null }, { today: calendar.today() });
  sql.tx(() => {
    sql.run('DELETE FROM api_tokens WHERE user_id = ?', agentId);
    sql.run('DELETE FROM agent_webhooks WHERE agent_id = ?', agentId);
    sql.run("DELETE FROM webhook_deliveries WHERE agent_id = ? AND status IN ('pending', 'sending')", agentId);
    sql.run('DELETE FROM watchers WHERE user_id = ?', agentId);
    sql.run("UPDATE agent_approvals SET status = 'expired', decided_at = ? WHERE agent_id = ? AND status = 'pending'", Date.now(), agentId);
    sql.run("UPDATE agents SET removed_at = ?, paused_at = NULL, instructions = '', api_key_ct = NULL, endpoint = NULL, updated_at = ? WHERE user_id = ?", Date.now(), Date.now(), agentId);
    sql.run('UPDATE users SET deactivated = 1 WHERE id = ?', agentId);
  });
  agentScope.forget(agentId);
  audit({ agentId, actorId: admin.id, via: 'admin', action: 'agent_removed', outcome: 'ok', detail: { unassigned: open.length } });
  publishUser(agentId);
}
