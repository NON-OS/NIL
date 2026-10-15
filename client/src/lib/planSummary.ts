import dates from './dates';
import timeLeft from './timeLeft';
import type Plan from '../types/Plan';

const DAY = 86_400_000;
const day = (ms: number) => dates.short(dates.toISO(new Date(ms)));

// One line for where the subscription stands, plus a tone the badge can wear.
export default function planSummary(plan: Plan, now = Date.now()): { tone: 'on' | 'warn' | 'off'; title: string; detail: string } {
  if (!plan.enforced) return { tone: 'on', title: 'Community mode', detail: 'This server has no subscription set up, so everything is unlocked.' };
  const until = plan.paidUntil ?? 0;
  if (plan.trial) return { tone: 'on', title: `Trial · ${timeLeft(until, now)}`, detail: `Everything is unlocked until ${day(until)}.` };
  if (plan.active) return { tone: 'on', title: `Active until ${day(until)}`, detail: `${timeLeft(until, now)} on the plan.` };
  if (plan.inGrace) {
    const locks = until + (plan.graceDays ?? 0) * DAY;
    return { tone: 'warn', title: `Grace period · locks ${day(locks)}`, detail: 'The plan ran out. Paid tools keep working for a few days while you renew.' };
  }
  return { tone: 'off', title: 'Paid tools paused', detail: 'Tasks, docs and exports keep working. Bounties already promised can still be paid.' };
}
