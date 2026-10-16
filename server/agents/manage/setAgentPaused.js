import sql from '../../db/sql.js';
import publishUser from '../../services/publishUser.js';
import worker from '../runner/worker.js';
import audit from '../audit.js';

// Pausing stops an agent at once: its key is refused, queued and running work is cancelled and
// nothing waiting for its webhook goes out. Resuming starts it fresh; nothing piles up meanwhile.
export default function setAgentPaused(agentId, paused, admin) {
  sql.run('UPDATE agents SET paused_at = ?, updated_at = ? WHERE user_id = ?', paused ? Date.now() : null, Date.now(), agentId);
  if (paused) {
    worker.cancelAgent(agentId, 'The agent was paused.');
    sql.run("UPDATE webhook_deliveries SET status = 'canceled', last_error = 'The agent was paused.' WHERE agent_id = ? AND status = 'pending'", agentId);
  }
  audit({ agentId, actorId: admin.id, via: 'admin', action: paused ? 'agent_paused' : 'agent_resumed', outcome: 'ok' });
  publishUser(agentId);
}
