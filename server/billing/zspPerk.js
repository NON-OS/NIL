import config from '../config.js';
import billingState from './billingState.js';

const HOUR = 3_600_000;

// Pro for workspaces whose owner or an admin holds a Zero-State Pass, decided only by the
// scheduled checks (perkChecks), never by a quote or an invoice. A pass starts Pro once the checks
// have kept finding one for at least PLAN_PERK_CHECK_HOURS, so holding a borrowed pass for a
// moment earns nothing. While it runs, each check that finds a pass covers two intervals, so one
// missed check (a node outage) doesn't drop Pro. The first check that finds none ends it at once,
// with no grace period after it.
const zspPerk = {
  enabled: () => Boolean(config.billing.proForZsp && config.power.zsp && config.nox.enabled),

  get: () => billingState.get('zsp', { until: null, checkedAt: null, seenSince: null }),

  until() {
    return zspPerk.enabled() ? zspPerk.get().until ?? null : null;
  },

  // Records what a scheduled check of the admins' holdings found.
  record(holdings, now = Date.now()) {
    if (!zspPerk.enabled()) return zspPerk.get();
    const previous = zspPerk.get();
    const interval = config.billing.perkCheckHours * HOUR;
    const held = holdings.some((h) => h.zsp > 0n);
    const seenSince = held ? previous.seenSince ?? now : null;
    const running = Boolean(previous.until && previous.until > now);
    let until = previous.until ?? null;
    if (held && (running || now - seenSince >= interval)) until = now + 2 * interval;
    else if (!held && running) until = now;
    const next = { until, checkedAt: now, seenSince };
    billingState.set('zsp', next);
    return next;
  },
};

export default zspPerk;
