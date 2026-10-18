import sql from '../../db/sql.js';
import publishRun from './publishRun.js';

const CAP = 4000;
const clip = (value) => {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > CAP ? `${text.slice(0, CAP)}…` : text;
};

// The run log: one row per model turn, tool call, refusal or note, in order. Every tool call is
// written here whatever its outcome, alongside the agent's audit trail. A tool call keeps the
// task it was about, so the step can be wiped when that task turns private or is erased.
export default function stepLog(runId) {
  let seq = sql.get('SELECT COALESCE(MAX(seq), 0) AS n FROM agent_steps WHERE run_id = ?', runId).n;
  return {
    add(kind, { tool = null, input = null, output = null, ok = true, taskId = null } = {}) {
      seq += 1;
      sql.run(
        'INSERT INTO agent_steps (run_id, seq, kind, tool, input, output, ok, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        runId, seq, kind, tool, clip(input), clip(output), ok ? 1 : 0, taskId, Date.now(),
      );
      sql.run('UPDATE agent_runs SET steps = ? WHERE id = ?', seq, runId);
      publishRun(runId);
    },
  };
}
