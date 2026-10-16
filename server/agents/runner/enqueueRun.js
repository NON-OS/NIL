import sql from '../../db/sql.js';
import newId from '../../lib/newId.js';
import parseJSON from '../../lib/parseJSON.js';
import loadAgent from '../loadAgent.js';
import agentBlocked from '../agentBlocked.js';
import signals from '../signals.js';
import builtInRunners from './builtInRunners.js';

// Queues work for an agent backed by the built-in runner. A run that is still waiting for the
// same agent and task absorbs the new trigger, so a burst of mentions becomes one run that sees
// all of them instead of several runs tripping over each other.
export default function enqueueRun({ agentId, taskId, trigger, actingFor = null, detail = {} }) {
  const agent = loadAgent(agentId);
  if (!agent || !builtInRunners.includes(agent.runner) || agentBlocked(agent)) return null;
  const entry = { type: trigger, actorId: actingFor, ...detail };
  const waiting = sql.get("SELECT id, context FROM agent_runs WHERE agent_id = ? AND task_id IS ? AND status = 'queued' AND attempts = 0", agentId, taskId);
  if (waiting) {
    const context = parseJSON(waiting.context, {});
    sql.run('UPDATE agent_runs SET context = ? WHERE id = ?', JSON.stringify({ ...context, triggers: [...(context.triggers ?? []), entry] }), waiting.id);
    return waiting.id;
  }
  const id = newId();
  const now = Date.now();
  sql.run(
    'INSERT INTO agent_runs (id, agent_id, task_id, trigger, acting_for, context, run_after, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, agentId, taskId, trigger, actingFor, JSON.stringify({ triggers: [entry] }), now, agent.model, now,
  );
  signals.emit('run');
  return id;
}
