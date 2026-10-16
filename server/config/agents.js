import envNumber from '../lib/envNumber.js';
import envAmount from '../lib/envAmount.js';
import configWarning from '../lib/configWarning.js';
import domain from '../lib/domain.js';
import ai from './ai.js';
import units from './units.js';

// Agents. These are workspace-wide defaults; each limit can be lowered or raised per agent in
// Settings → Agents. Built-in agents on Anthropic use AGENT_MODEL, then ANTHROPIC_MODEL, or the
// model entered on the agent.
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

function agentEffort(value) {
  if (!value) return 'high';
  if (value === 'off') return null;
  if (EFFORTS.includes(value)) return value;
  configWarning(`AGENT_EFFORT=${value} isn’t one of ${EFFORTS.join(', ')} or off. Using the default, high.`);
  return 'high';
}

// Anthropic's server-side fallback to another model when a request is declined. Off unless asked
// for: not every model or account takes it.
function agentFallbacks(value) {
  if (!value || value === 'off') return null;
  if (value === 'default') return 'default';
  configWarning(`AGENT_FALLBACKS=${value} isn’t "default" or "off". Leaving fallbacks off.`);
  return null;
}

function agentDoneStatus(value) {
  if (!value) return 'in_review';
  if (value === 'none' || domain.statuses.includes(value)) return value;
  configWarning(`AGENT_DONE_STATUS=${value} isn’t a task status or "none". Using the default, in_review.`);
  return 'in_review';
}

const env = process.env;
const seconds = (name, fallback, limits) => envNumber(name, fallback, limits) * units.SECOND;

export default Object.freeze({
  model: (env.AGENT_MODEL ?? '').trim() || ai.model,
  effort: agentEffort((env.AGENT_EFFORT ?? '').trim()),
  thinking: env.AGENT_THINKING === 'off' ? 'off' : 'adaptive',
  fallbacks: agentFallbacks((env.AGENT_FALLBACKS ?? '').trim()),
  maxSteps: envNumber('AGENT_MAX_STEPS', 12, { min: 1, max: 100 }),
  maxRunTokens: envNumber('AGENT_MAX_TOKENS_PER_RUN', 300_000, { min: 1000 }),
  maxDayTokens: envNumber('AGENT_MAX_TOKENS_PER_DAY', 3_000_000, { min: 1000 }),
  maxOutputTokens: envNumber('AGENT_MAX_OUTPUT_TOKENS', 32_000, { min: 256, max: 128_000 }),
  runTimeoutMs: seconds('AGENT_RUN_TIMEOUT_SECONDS', 600, { min: 1 }),
  concurrency: envNumber('AGENT_CONCURRENCY', 2, { min: 1, max: 32 }),
  retries: envNumber('AGENT_RETRIES', 3, { max: 10 }),
  pollMs: seconds('AGENT_POLL_SECONDS', 5, { min: 1, max: 300 }),
  doneStatus: agentDoneStatus((env.AGENT_DONE_STATUS ?? '').trim()),
  rateLimit: envNumber('AGENT_RATE_LIMIT', 60, { min: 1 }),
  idempotencyHours: envNumber('AGENT_IDEMPOTENCY_HOURS', 24, { min: 1 }),
  bulkLimit: envNumber('AGENT_BULK_LIMIT', 5, { min: 1 }),
  bulkWindowMs: envNumber('AGENT_BULK_WINDOW_MINUTES', 10, { min: 1 }) * 60_000,
  maxPendingApprovals: envNumber('AGENT_MAX_PENDING_APPROVALS', 20, { min: 1 }),
  allowLocalEndpoints: env.AGENT_ALLOW_LOCAL_ENDPOINTS === 'true',
  webhookTimeoutMs: seconds('AGENT_WEBHOOK_TIMEOUT_SECONDS', 10, { min: 1, max: 60 }),
  webhookMaxAttempts: envNumber('AGENT_WEBHOOK_MAX_ATTEMPTS', 8, { min: 1, max: 20 }),
  webhookBackoffMs: seconds('AGENT_WEBHOOK_BACKOFF_SECONDS', 30, { min: 1 }),
  webhookDisableAfter: envNumber('AGENT_WEBHOOK_DISABLE_AFTER', 20, { min: 1 }),
  webhookToleranceSeconds: envNumber('AGENT_WEBHOOK_TOLERANCE_SECONDS', 300, { min: 30 }),
  dueSoonHours: envNumber('AGENT_DUE_SOON_HOURS', 24, { min: 1 }),
  // dollars per million tokens for the cost estimate of Anthropic runs; unset means no estimate
  priceIn: envAmount('AGENT_PRICE_INPUT_PER_MTOK', null),
  priceOut: envAmount('AGENT_PRICE_OUTPUT_PER_MTOK', null),
});
