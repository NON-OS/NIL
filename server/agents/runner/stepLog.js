import sql from '../../db/sql.js';
import publishRun from './publishRun.js';

const CAP = 4000;
const clip = (value) => {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > CAP ? `${text.slice(0, CAP)}…` : text;
};

// The run log: one row per model turn, tool call, refusal or note, in order. Every tool call is
// written here whatever its outcome, alongside the agent's audit trail.
export default function stepLog(runId) {
  let seq = sql.get('SELECT COALESCE(MAX(seq), 0) AS n FROM agent_steps WHERE run_id = ?', runId).n;
  return {
    add(kind, { tool = null, input = null, output = null, ok = true } = {}) {
      seq += 1;
      sql.run('INSERT INTO agent_steps (run_id, seq, kind, tool, input, output, ok, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', runId, seq, kind, tool, clip(input), clip(output), ok ? 1 : 0, Date.now());
      sql.run('UPDATE agent_runs SET steps = ? WHERE id = ?', seq, runId);
      publishRun(runId);
    },
  };
}
