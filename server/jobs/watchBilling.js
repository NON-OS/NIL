import sql from '../db/sql.js';
import config from '../config.js';
import log from '../lib/log.js';
import logLimited from '../lib/logLimited.js';
import notify from '../services/notify.js';
import billingStalls from '../billing/billingStalls.js';
import billingState from '../billing/billingState.js';

// The billing watchdog, every JOB_BILLING_WATCHDOG_SECONDS. Each stall it finds is told once to
// the owners and admins as a notification in the app, and to the operator in the log while it
// lasts and in /healthz, which hosted Nil turns into an alert. A stall that clears is forgotten,
// so the next one is told again. Returns what it found.
export default function watchBilling(now = Date.now()) {
  if (!config.nox.enabled) return [];
  const found = billingStalls(now);
  const known = billingState.get('stalls', {});
  const next = {};
  const admins = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role IN ('owner', 'admin')").map((r) => r.id);
  for (const stall of found) {
    next[stall.code] = known[stall.code] ?? now;
    logLimited(`billing:stall:${stall.code}`, 'warn', 'billing', stall.text);
    if (!known[stall.code]) notify(admins, 'billing_stalled', null, null, { code: stall.code, count: stall.count, text: stall.text });
  }
  for (const code of Object.keys(known).filter((c) => !next[c])) log.info('billing', `Moving again after a stall: ${code}.`);
  billingState.set('stalls', next);
  return found;
}
