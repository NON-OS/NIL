import sql from '../../db/sql.js';
import config from '../../config.js';
import agentSettings from '../agentSettings.js';
import signals from '../signals.js';
import executeRun from './executeRun.js';
import publishRun from './publishRun.js';
import stepLog from './stepLog.js';
import log from '../../lib/log.js';

const running = new Map();
let started = false;

// Takes the oldest due run, unless the same agent is already working on the same task.
function lease() {
  const row = sql.get(
    `SELECT * FROM agent_runs r WHERE r.status = 'queued' AND r.run_after <= ?
       AND NOT EXISTS (SELECT 1 FROM agent_runs o WHERE o.status = 'running' AND o.agent_id = r.agent_id AND o.task_id IS r.task_id)
     ORDER BY r.run_after LIMIT 1`,
    Date.now(),
  );
  if (!row) return null;
  const taken = sql.run("UPDATE agent_runs SET status = 'running', started_at = COALESCE(started_at, ?), attempts = attempts + 1 WHERE id = ? AND status = 'queued'", Date.now(), row.id);
  return taken.changes ? sql.get('SELECT * FROM agent_runs WHERE id = ?', row.id) : null;
}

function cancelWhere(clause, params, reason) {
  for (const { id } of sql.all(`SELECT id FROM agent_runs WHERE status = 'queued' AND ${clause}`, ...params)) {
    sql.run("UPDATE agent_runs SET status = 'canceled', finished_at = ?, error = ? WHERE id = ? AND status = 'queued'", Date.now(), reason, id);
    publishRun(id);
  }
  for (const { id } of sql.all(`SELECT id FROM agent_runs WHERE status = 'running' AND ${clause}`, ...params)) running.get(id)?.abort(new Error(reason));
}

// The built-in runner's queue worker. The queue lives in SQLite, so it survives restarts;
// concurrency, cancellation and the kill switch are handled here.
const worker = {
  // Called on a timer and whenever work is queued: starts runs until the concurrency limit.
  tick() {
    started = true;
    if (!agentSettings.enabled()) return;
    while (running.size < config.agents.concurrency) {
      const row = lease();
      if (!row) break;
      const controller = new AbortController();
      running.set(row.id, controller);
      publishRun(row.id);
      executeRun(row, controller.signal)
        .catch((err) => {
          log.error('agents', `run ${row.id} crashed`, err);
          sql.run("UPDATE agent_runs SET status = 'failed', finished_at = ?, error = 'The run crashed.' WHERE id = ? AND status = 'running'", Date.now(), row.id);
        })
        .finally(() => {
          running.delete(row.id);
          setImmediate(worker.tick);
        });
    }
  },

  // At startup nothing can still be running, so a run marked running was cut off by a stop or
  // crash. It goes back in the queue, unless it has already used up its attempts.
  recover() {
    for (const row of sql.all("SELECT id, attempts FROM agent_runs WHERE status = 'running'")) {
      const steps = stepLog(row.id);
      if (row.attempts > config.agents.retries) {
        steps.add('note', { output: 'The server stopped during this run, and it has no attempts left.', ok: false });
        sql.run("UPDATE agent_runs SET status = 'failed', finished_at = ?, error = 'Interrupted by a server restart too many times.' WHERE id = ?", Date.now(), row.id);
      } else {
        steps.add('note', { output: 'The server stopped during this run. It will start again.', ok: false });
        sql.run("UPDATE agent_runs SET status = 'queued', run_after = ? WHERE id = ?", Date.now(), row.id);
      }
    }
  },

  cancel: (runId, reason = 'Cancelled by an admin.') => cancelWhere('id = ?', [runId], reason),
  cancelAgent: (agentId, reason) => cancelWhere('agent_id = ?', [agentId], reason),
  cancelAll: (reason) => cancelWhere('1 = 1', [], reason),

  // Resolves once nothing is running; lets tests and shutdown wait for work to settle.
  async idle(timeoutMs = 10_000) {
    const until = Date.now() + timeoutMs;
    while ((running.size || sql.get("SELECT 1 FROM agent_runs WHERE status = 'queued' AND run_after <= ?", Date.now())) && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  },

  get active() {
    return running.size;
  },
};

signals.on('run', () => {
  if (started) setImmediate(worker.tick);
});

export default worker;
