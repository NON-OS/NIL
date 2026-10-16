import sql from '../db/sql.js';
import config from '../config.js';
import billingState from '../billing/billingState.js';
import trialWindow from '../billing/trialWindow.js';
import zspPerk from '../billing/zspPerk.js';
import acceptedTokens from '../billing/acceptedTokens.js';

const DAY = 86_400_000;

// Where the workspace's Nil Pro stands. Pro comes from paid time, the trial, or a Zero-State
// Pass held by an admin; "unlocked" is what gates the paid tools: always in community mode,
// and otherwise while Pro is active or in the grace period after it.
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
      { source: 'zsp', until: zspUntil, lockAt: zspUntil === null ? null : zspUntil + grace },
      { source: 'trial', until: trial?.until ?? null, lockAt: trial?.lockAt ?? null },
    ].filter((s) => s.until !== null);
    const activeUntil = sources.length ? Math.max(...sources.map((s) => s.until)) : null;
    const lockAt = sources.length ? Math.max(...sources.map((s) => s.lockAt)) : null;
    const active = Boolean(activeUntil && activeUntil > now);
    const unlocked = !enforced || Boolean(lockAt && lockAt > now);
    // paid time wins when it overlaps, since it's the one an admin chose to buy
    const source = active ? sources.filter((s) => s.until > now).sort((a, b) => ['paid', 'zsp', 'trial'].indexOf(a.source) - ['paid', 'zsp', 'trial'].indexOf(b.source))[0].source : null;

    const seatsUsed = sql.get("SELECT COUNT(*) AS n FROM users WHERE deactivated = 0 AND role != 'guest'").n;
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
      seatLimit: plan.seatLimit(sources, now),
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
  // a Zero-State Pass keeps it unlocked; the seats paid for while paid time does; the free
  // seats once nothing does. Null in community mode.
  seatLimit(sources, now) {
    if (!(config.plan.treasury && config.nox.enabled)) return null;
    const unlocking = sources.filter((s) => s.lockAt > now);
    if (unlocking.some((s) => s.source !== 'paid')) return null;
    if (unlocking.length) return Math.max(billingState.get('plan', {}).seatLimit ?? 0, config.plan.freeSeats);
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

  // Seats paid for. A renewal that starts after the current paid time keeps the larger count
  // until then rather than taking seats away mid-period.
  coverSeats(people, { renewal = false, now = Date.now() } = {}) {
    const stored = billingState.get('plan', {});
    const running = stored.paidUntil && stored.paidUntil > now;
    const seatLimit = renewal && !running ? people : Math.max(stored.seatLimit ?? 0, people);
    billingState.set('plan', { ...stored, seatLimit });
    return seatLimit;
  },
};

export default plan;
