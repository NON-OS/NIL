import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import config from '../config.js';
import retention from '../services/retention.js';

const DAY = 86_400_000;

// Runs hourly, and when an admin changes the retention settings. Spent idempotency keys,
// bulk-limit counters and old delivery logs go. Run logs quote task text and comments, so a run
// whose task was erased loses its log (its token count stays for the usage numbers), and logs,
// run summaries, the audit trail, decided approval cards and stored replies follow the
// workspace's zero-state policy for comments and history. A request still waiting for approval
// stays until someone decides it.
export default function pruneAgentData() {
  const now = Date.now();
  const policy = retention.get();
  const keepDays = [policy.commentDays, policy.activityDays].filter(Boolean);
  sql.tx(() => {
    sql.run('DELETE FROM agent_idempotency WHERE created_at < ?', now - config.agents.idempotencyHours * 3_600_000);
    sql.run('DELETE FROM agent_writes WHERE created_at < ?', now - config.agents.bulkWindowMs);
    sql.run("DELETE FROM webhook_deliveries WHERE status IN ('delivered', 'failed', 'canceled') AND created_at < ?", now - 30 * DAY);
    sql.run('DELETE FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE task_id IS NULL)');
    sql.run('UPDATE agent_runs SET summary = NULL WHERE task_id IS NULL AND summary IS NOT NULL');
    if (keepDays.length) {
      const cutoff = now - Math.min(...keepDays) * DAY;
      sql.run('DELETE FROM agent_steps WHERE created_at < ?', cutoff);
      sql.run('UPDATE agent_runs SET summary = NULL WHERE created_at < ?', cutoff);
      sql.run('DELETE FROM agent_audit WHERE created_at < ?', cutoff);
      sql.run("DELETE FROM agent_approvals WHERE status != 'pending' AND created_at < ?", cutoff);
      sql.run('DELETE FROM agent_idempotency WHERE created_at < ?', cutoff);
    }
  });
  // what was erased mustn't survive in the write-ahead log
  checkpoint();
}
