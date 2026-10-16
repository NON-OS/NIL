import sql from '../db/sql.js';
import config from '../config.js';
import notify from '../services/notify.js';
import plan from '../services/plan.js';
import billingState from './billingState.js';

const DAY = 86_400_000;

// Tells the owners and admins ahead of time that Nil Pro is about to run out (7 days and 1 day
// before, by default). Each reminder goes once per end date; paying moves the end date, so the
// next round starts fresh. A Zero-State Pass renews itself, so it gets no reminders.
export default function remindPlanEnd(now = Date.now()) {
  const status = plan.status(now);
  if (!status.enforced || !status.active || status.zsp.active) return 0;
  const end = status.activeUntil;
  const sent = billingState.get('reminders', { end: null, days: [] });
  const already = sent.end === end ? sent.days : [];
  const due = config.billing.remindDays.filter((d) => !already.includes(d) && end - now <= d * DAY);
  if (!due.length) return 0;

  const admins = sql.all("SELECT id FROM users WHERE deactivated = 0 AND role IN ('owner', 'admin')").map((r) => r.id);
  // a late start (the server was down) sends only the nearest reminder, not every missed one
  notify(admins, 'plan_ending', null, null, { until: end, lockAt: status.lockAt, days: Math.min(...due), trial: status.trial });
  billingState.set('reminders', { end, days: [...already, ...due] });
  return admins.length;
}
