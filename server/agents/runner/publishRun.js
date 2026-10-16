import sql from '../../db/sql.js';
import toTaskViewers from '../../services/toTaskViewers.js';
import toRun from './toRun.js';

// Pushes a run's latest state and log to everyone looking at its task, so the timeline follows
// the agent step by step.
export default function publishRun(runId) {
  const row = sql.get('SELECT * FROM agent_runs WHERE id = ?', runId);
  if (row?.task_id) toTaskViewers(row.task_id, { type: 'agent.run', run: toRun(row, { withSteps: true }) });
}
