import sql from '../db/sql.js';
import config from '../config.js';
import settingsStore from './settingsStore.js';

const DAY = 86_400_000;

// Until the first payment, a workspace runs on a trial counted from the day it was set up.
// Counting from setup (not from when a treasury was configured) keeps it one window, once.
function paidThrough(stored) {
  if (stored.paidUntil) return { paidUntil: stored.paidUntil, trial: false };
  const ws = sql.get('SELECT created_at FROM workspace WHERE id = 1');
  if (!ws || config.plan.trialDays <= 0) return { paidUntil: null, trial: false };
  return { paidUntil: ws.created_at + config.plan.trialDays * DAY, trial: true };
}

// Where the workspace's subscription stands. "unlocked" is what gates utilities: true in
// community mode, while paid, and through the grace period after a lapse.
const plan = {
  status() {
    const enforced = Boolean(config.plan.treasury && config.nox.enabled && config.plan.price);
    const { paidUntil, trial } = paidThrough(settingsStore.get('plan', {}));
    const now = Date.now();
    const active = Boolean(paidUntil && paidUntil > now);
    const inGrace = !active && Boolean(paidUntil && paidUntil + config.plan.graceDays * DAY > now);
    const seatsUsed = sql.get("SELECT COUNT(*) AS n FROM users WHERE deactivated = 0 AND role != 'guest'").n;
    return {
      enforced,
      unlocked: !enforced || active || inGrace,
      active,
      inGrace,
      paidUntil,
      trial: trial && active,
      price: config.plan.price,
      periodDays: config.plan.periodDays,
      maxPeriods: config.plan.maxPeriods,
      graceDays: config.plan.graceDays,
      freeSeats: config.plan.freeSeats,
      seatsUsed,
      treasury: config.plan.treasury,
    };
  },

  extend(periods) {
    // paying during the trial adds to it, so nobody loses the days they were given
    const current = paidThrough(settingsStore.get('plan', {})).paidUntil ?? 0;
    const paidUntil = Math.max(current, Date.now()) + periods * config.plan.periodDays * DAY;
    settingsStore.set('plan', { paidUntil });
    return paidUntil;
  },
};

export default plan;
