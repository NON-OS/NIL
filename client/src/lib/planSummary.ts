import dates from './dates';
import timeLeft from './timeLeft';
import type Plan from '../types/Plan';

const day = (ms: number) => dates.short(dates.toISO(new Date(ms)));

// One line for where Nil Pro stands, plus a tone the badge can wear.
export default function planSummary(plan: Plan, now = Date.now()): { tone: 'on' | 'warn' | 'off'; title: string; detail: string } {
  if (!plan.enforced) return { tone: 'on', title: 'Community mode', detail: 'This server has no subscription set up, so everything is unlocked.' };
  const until = plan.activeUntil ?? 0;
  const lockAt = plan.lockAt ?? 0;
  if (plan.overSeats) return { tone: 'warn', title: 'More people than seats', detail: `Nil Pro covers ${plan.seatLimit} and ${plan.seatsUsed} people are here, so the paid tools are paused. Add seats below, or make someone a guest.` };
  if (plan.source === 'zsp') return { tone: 'on', title: 'Pro with a Zero-State Pass', detail: 'An admin holds a Zero-State Pass, so this workspace has Nil Pro. It’s checked again every few hours.' };
  if (plan.trial) return { tone: 'on', title: `Trial · ${timeLeft(until, now)}`, detail: `Everything is unlocked. The trial ends on ${day(until)}, and the paid tools keep working until ${day(lockAt)}.` };
  if (plan.active) return { tone: 'on', title: `Pro until ${day(until)}`, detail: `${timeLeft(until, now)} of Nil Pro.` };
  if (plan.inGrace) return { tone: 'warn', title: `Grace period · locks ${day(lockAt)}`, detail: 'Nil Pro ran out. The paid tools keep working for a few days while you renew.' };
  return { tone: 'off', title: 'Paid tools paused', detail: 'Tasks, docs and exports keep working. Bounties already promised can still be paid.' };
}
