import envNumber from '../lib/envNumber.js';
import units from './units.js';

const every = (name, seconds) => envNumber(name, seconds, { min: 1 }) * units.SECOND;

// How often each background job runs.
export default Object.freeze({
  purgeMs: every('JOB_PURGE_SECONDS', 3600),
  paymentsMs: every('JOB_PAYMENTS_SECONDS', 60),
  votesMs: every('JOB_VOTES_SECONDS', 60),
  remindersMs: every('JOB_REMINDERS_SECONDS', 60),
  dueAlertsMs: every('JOB_DUE_ALERTS_SECONDS', 60),
  agentDueSoonMs: every('JOB_AGENT_DUE_SOON_SECONDS', 300),
  agentPruneMs: every('JOB_AGENT_PRUNE_SECONDS', 3600),
  optimizeMs: every('JOB_OPTIMIZE_SECONDS', 3600),
  poolPriceMs: every('JOB_POOL_PRICE_SECONDS', 60),
  transferFeeMs: every('JOB_TRANSFER_FEE_SECONDS', 600),
  billingWatchdogMs: every('JOB_BILLING_WATCHDOG_SECONDS', 300),
});
