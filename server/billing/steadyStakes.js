import config from '../config.js';
import billingState from './billingState.js';

const HOUR = 3_600_000;
const reaches = (staked, tier) => BigInt(staked) >= BigInt(tier.stake) * 10n ** BigInt(config.nox.decimals);

// The staker discount counts a stake only once the scheduled checks (perkChecks) have kept seeing
// it, tier by tier, for at least PLAN_PERK_CHECK_HOURS, and only while a fresh read when the
// invoice is made still finds it. A stake moved in just for the moment an invoice is made, or
// passed from one workspace to the next, earns nothing; one that stays put earns its tier.
const steadyStakes = {
  // Records which tiers each admin's stake reached at a scheduled check.
  record(holdings, now = Date.now()) {
    const previous = billingState.get('stakes', {});
    const next = {};
    for (const h of holdings) {
      for (const tier of config.billing.stakerTiers.filter((t) => reaches(h.staked, t))) {
        const since = previous[h.userId]?.[tier.stake]?.since ?? now;
        (next[h.userId] ??= {})[tier.stake] = { since, steady: now - since >= config.billing.perkCheckHours * HOUR };
      }
    }
    billingState.set('stakes', next);
  },

  // The discount in percent for holdings read just now: the highest tier one admin both reaches
  // now and has held steadily at the checks. Two admins can't pool their stakes.
  percent(holdings) {
    const seen = billingState.get('stakes', {});
    let percent = 0;
    for (const h of holdings) {
      for (const tier of config.billing.stakerTiers) {
        if (reaches(h.staked, tier) && seen[h.userId]?.[tier.stake]?.steady) percent = Math.max(percent, tier.percent);
      }
    }
    return percent;
  },
};

export default steadyStakes;
