import sql from '../../db/sql.js';
import newId from '../../lib/newId.js';
import parseJSON from '../../lib/parseJSON.js';
import loadAgent from '../loadAgent.js';
import agentBlocked from '../agentBlocked.js';
import signals from '../signals.js';

// Queues one event for an agent's webhook, if it has one that's on and wants this event. The
// payload is deliberately thin: ids, task keys, who did it and what kind of change, never titles,
// descriptions or comment text. The agent reads the details through the API with its own key,
// where its visibility rules apply. `force` skips the event filter and the switched-off check
// (the test ping), and `hold` keeps the delivery out of the queue for the caller to send itself.
export default function enqueueDelivery(agentId, event, data, { force = false, hold = false } = {}) {
  const hook = sql.get('SELECT * FROM agent_webhooks WHERE agent_id = ?', agentId);
  if (!hook || (hook.disabled_at && !force)) return null;
  if (!force && !parseJSON(hook.events, []).includes(event)) return null;
  const agent = loadAgent(agentId);
  if (agentBlocked(agent)) return null;
  const id = newId();
  const now = Date.now();
  const payload = JSON.stringify({ id, type: event, createdAt: new Date(now).toISOString(), agent: { id: agent.id, name: agent.name }, data });
  sql.run('INSERT INTO webhook_deliveries (id, agent_id, event, payload, status, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, agentId, event, payload, hold ? 'held' : 'pending', now, now);
  if (!hold) signals.emit('delivery');
  return id;
}
