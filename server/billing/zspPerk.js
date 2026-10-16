import config from '../config.js';
import billingState from './billingState.js';

const HOUR = 3_600_000;

// Pro for workspaces whose owner or an admin holds a Zero-State Pass. Each check that finds a
// pass covers two check intervals, so one missed check (a node outage) doesn't drop Pro; a
// check that finds none ends it right away, and the usual grace period follows.
const zspPerk = {
  enabled: () => Boolean(config.billing.proForZsp && config.power.zsp && config.nox.enabled),

  get: () => billingState.get('zsp', { until: null, checkedAt: null }),

  until() {
    return zspPerk.enabled() ? zspPerk.get().until ?? null : null;
  },

  // Records what a fresh look at the admins' holdings found.
  record(holdings, now = Date.now()) {
    if (!zspPerk.enabled()) return zspPerk.get();
    const holder = holdings.find((h) => h.zsp > 0n);
    const previous = zspPerk.get();
    const next = holder
      ? { until: now + 2 * config.billing.perkCheckHours * HOUR, checkedAt: now }
      : { until: previous.until && previous.until > now ? now : previous.until, checkedAt: now };
    billingState.set('zsp', next);
    return next;
  },

  due(now = Date.now()) {
    const { checkedAt } = zspPerk.get();
    return zspPerk.enabled() && (!checkedAt || now - checkedAt >= config.billing.perkCheckHours * HOUR);
  },
};

export default zspPerk;
