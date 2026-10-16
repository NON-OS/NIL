import sql from '../../db/sql.js';
import agentSettings from '../agentSettings.js';
import worker from '../runner/worker.js';
import audit from '../audit.js';

// The workspace kill switch. Off stops every agent at once: keys are refused, running and queued
// runs are cancelled and queued webhook deliveries are dropped. On again starts from a clean slate.
export default function setAgentsEnabled(enabled, admin) {
  const settings = agentSettings.set(enabled, admin.id);
  if (!enabled) {
    worker.cancelAll('All agents were switched off.');
    sql.run("UPDATE webhook_deliveries SET status = 'canceled', last_error = 'All agents were switched off.' WHERE status = 'pending'");
  }
  audit({ agentId: null, actorId: admin.id, via: 'admin', action: enabled ? 'agents_switched_on' : 'agents_switched_off', outcome: 'ok' });
  return settings;
}
