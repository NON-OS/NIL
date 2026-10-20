import config from '../config.js';
import billingState from '../billing/billingState.js';
import trialWindow from '../billing/trialWindow.js';
import zspPerk from '../billing/zspPerk.js';
import acceptedTokens from '../billing/acceptedTokens.js';
import seatHolders from './seatHolders.js';
import seatSteps from '../billing/seatSteps.js';
import seatsAt from '../billing/seatsAt.js';

const DAY = 86_400_000;

// Where the workspace's Nil Pro stands. Pro comes from paid time, the trial, or a Zero-State
// Pass held by an admin; "unlocked" is what gates the paid tools: always in community mode,
// and otherwise while Pro is active or in the grace period after paid time or the trial. Pro by
// pass has no grace period: it lasts exactly as long as the checks keep finding a pass, so a pass
// held for a moment can't buy days of Pro. More people than the seats paid for pauses the paid
// tools too, since seats are only checked at the door and people can come in while the trial or
// a pass leaves it open.
const plan = {
  status(now = Date.now()) {
    const enforced = Boolean(config.plan.treasury && config.nox.enabled);
    const stored = billingState.get('plan', {});
    const grace = config.plan.graceDays * DAY;
    const paidUntil = stored.paidUntil ?? null;
    const trial = trialWindow();
    const zspUntil = zspPerk.until();

    const sources = [
      { source: 'paid', until: paidUntil, lockAt: paidUntil === null ? null : paidUntil + grace },
      { source: 'zsp', until: zspUntil, lockAt: zspUntil },
      { source: 'trial', until: trial?.until ?? null, lockAt: trial?.lockAt ?? null },
    ].filter((s) => s.until !== null);
    const activeUntil = sources.length ? Math.max(...sources.map((s) => s.until)) : null;
    const lockAt = sources.length ? Math.max(...sources.map((s) => s.lockAt)) : null;
    const active = Boolean(activeUntil && activeUntil > now);
    const seatsUsed = seatHolders();
    const seatLimit = plan.seatLimit(sources, now);
    const open = Boolean(lockAt && lockAt > now);
    const overSeats = enforced && open && seatLimit !== null && seatsUsed > seatLimit;
    const unlocked = !enforced || (open && !overSeats);
    // paid time wins when it overlaps, since it's the one an admin chose to buy
    const source = active ? sources.filter((s) => s.until > now).sort((a, b) => ['paid', 'zsp', 'trial'].indexOf(a.source) - ['paid', 'zsp', 'trial'].indexOf(b.source))[0].source : null;

    return {
      enforced,
      unlocked,
      active,
      inGrace: enforced && unlocked && !active,
      trial: source === 'trial',
      source,
      activeUntil,
      lockAt,
      paidUntil,
      zsp: { enabled: zspPerk.enabled(), active: Boolean(zspUntil && zspUntil > now), checkedAt: zspPerk.get().checkedAt },
      seatsUsed,
      seatLimit,
      overSeats,
      freeSeats: config.plan.freeSeats,
      periodDays: config.plan.periodDays,
      maxPeriods: config.plan.maxPeriods,
      graceDays: config.plan.graceDays,
      trialDays: config.plan.trialDays,
      priceUsd: config.billing.priceUsd,
      seatUsd: config.billing.seatUsd,
      noxDiscount: config.billing.noxDiscount,
      stakerTiers: config.billing.stakerTiers,
      burnShare: config.billing.burnShare,
      tokens: acceptedTokens().map(({ symbol, address, decimals }) => ({ symbol, address, decimals })),
      treasury: config.plan.treasury,
      treasuryName: config.billing.treasuryName,
      invoiceHours: config.billing.invoiceHours,
    };
  },

  // How many people (guests aside) the workspace may have right now. No cap while the trial or
  // a Zero-State Pass keeps it unlocked (a pass only while it is found, since it has no grace);
  // the seats paid for while paid time does; the free seats once nothing does. Null in
  // community mode.
  seatLimit(sources, now) {
    if (!(config.plan.treasury && config.nox.enabled)) return null;
    const unlocking = sources.filter((s) => s.lockAt > now);
    if (unlocking.some((s) => s.source !== 'paid')) return null;
    if (unlocking.length) return Math.max(seatsAt(seatSteps(billingState.get('plan', {})), now), config.plan.freeSeats);
    return config.plan.freeSeats;
  },

  // Adds paid time. Paying while Pro is active (paid or trial) adds to the end of it, so
  // nobody loses days they already had. Returns the new paid-until.
  extend(ms, now = Date.now()) {
    const stored = billingState.get('plan', {});
    const trial = trialWindow();
    const from = Math.max(stored.paidUntil ?? 0, trial?.until ?? 0, now);
    const paidUntil = from + ms;
    billingState.set('plan', { ...stored, paidUntil });
    return paidUntil;
  },

  // Seats paid for, as steps in time. A renewal sets the count for the time it buys, from where
  // extend() starts that time, so seats bought for the last hours of a period end with it. Added
  // seats raise the count from now to the end of all paid time, which is what they were priced
  // for. Returns the count now.
  coverSeats(people, { renewal = false, now = Date.now() } = {}) {
    const stored = billingState.get('plan', {});
    const steps = seatSteps(stored);
    let next;
    if (renewal) {
      const from = Math.max(stored.paidUntil ?? 0, trialWindow()?.until ?? 0, now);
      next = [...steps.filter((s) => s.from < from), { from, seats: people }];
    } else {
      const later = steps.filter((s) => s.from > now).map((s) => ({ ...s, seats: Math.max(s.seats, people) }));
      next = [...steps.filter((s) => s.from < now), { from: now, seats: Math.max(seatsAt(steps, now), people) }, ...later];
    }
    // steps that ended before now are no use to anyone
    const current = next.findLastIndex((s) => s.from <= now);
    const saved = { ...stored, seatSteps: current > 0 ? next.slice(current) : next };
    delete saved.seatLimit;
    billingState.set('plan', saved);
    return seatsAt(next, now);
  },
};

export default plan;
