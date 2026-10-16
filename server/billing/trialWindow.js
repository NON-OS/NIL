import sql from '../db/sql.js';
import config from '../config.js';
import billingState from './billingState.js';

const DAY = 86_400_000;

// The free trial, once per server. It starts when the first workspace appears here and the
// start is kept through an erase, so setting up again never earns a second trial. Its last
// PLAN_GRACE_DAYS count as the grace period, so trial and grace together last exactly
// PLAN_TRIAL_DAYS. Null when there is no trial.
export default function trialWindow() {
  if (config.plan.trialDays <= 0) return null;
  let start = billingState.get('trialStart', null);
  if (start === null) {
    const ws = sql.get('SELECT created_at FROM workspace WHERE id = 1');
    if (!ws) return null;
    start = ws.created_at;
    billingState.set('trialStart', start);
  }
  const grace = Math.min(config.plan.graceDays, config.plan.trialDays);
  return { start, until: start + (config.plan.trialDays - grace) * DAY, lockAt: start + config.plan.trialDays * DAY };
}
