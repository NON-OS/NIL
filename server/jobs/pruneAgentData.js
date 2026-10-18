import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import inBatches from '../db/inBatches.js';
import deleteSome from '../db/deleteSome.js';
import config from '../config.js';
import retention from '../services/retention.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Runs hourly, and when an admin changes the retention settings. Spent idempotency keys,
// bulk-limit counters and old delivery logs go. Run logs quote task text and comments, so a run
// whose task was erased loses its log (its token count stays for the usage numbers), and logs,
// run summaries, the audit trail, decided approval cards and stored replies follow the
// workspace's zero-state policy for comments and history, as does the webhook delivery log
// when that is shorter. A request still waiting for approval stays until someone decides it.
// Like the purge, it erases in batches.
export default async function pruneAgentData(signal) {
  const now = Date.now();
  const policy = retention.get();
  const keepDays = [policy.commentDays, policy.activityDays].filter(Boolean);
  const batches = (step) => inBatches(step, { limit: config.purge.batchRows, signal });
  const rows = (table, where, ...params) => batches((limit) => deleteSome(table, where, limit, ...params));
  const summaries = (where, ...params) =>
    batches((limit) => sql.run(`UPDATE agent_runs SET summary = NULL WHERE rowid IN (SELECT rowid FROM agent_runs WHERE summary IS NOT NULL AND ${where} LIMIT ?)`, ...params, limit).changes);

  await rows('agent_idempotency', 'created_at < ?', now - config.agents.idempotencyHours * HOUR);
  await rows('agent_writes', 'created_at < ?', now - config.agents.bulkWindowMs);
  await rows('webhook_deliveries', "status IN ('delivered', 'failed', 'canceled') AND created_at < ?", now - Math.min(config.agents.webhookLogDays, ...keepDays) * DAY);
  await rows('agent_steps', 'run_id IN (SELECT id FROM agent_runs WHERE task_id IS NULL)');
  await summaries('task_id IS NULL');
  if (keepDays.length) {
    const cutoff = now - Math.min(...keepDays) * DAY;
    await rows('agent_steps', 'created_at < ?', cutoff);
    await summaries('created_at < ?', cutoff);
    await rows('agent_audit', 'created_at < ?', cutoff);
    await rows('agent_approvals', "status != 'pending' AND created_at < ?", cutoff);
    await rows('agent_idempotency', 'created_at < ?', cutoff);
  }
  // what was erased mustn't survive in the write-ahead log
  checkpoint();
}
