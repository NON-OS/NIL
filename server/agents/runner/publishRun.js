import sql from '../../db/sql.js';
import hub from '../../realtime/hub.js';
import loadTask from '../../services/loadTask.js';
import canSeeTask from '../../services/canSeeTask.js';
import forViewer from '../forViewer.js';
import toRun from './toRun.js';

// Pushes a run's latest state and log to everyone looking at its task, so the timeline follows
// the agent step by step.
export default function publishRun(runId) {
  const row = sql.get('SELECT * FROM agent_runs WHERE id = ?', runId);
  const task = row?.task_id ? loadTask(row.task_id) : null;
  if (!task) return;
  const run = toRun(row, { withSteps: true });
  hub.broadcast((viewer) => (canSeeTask(task, viewer) ? { type: 'agent.run', run: forViewer.run(run, viewer) } : null));
}
