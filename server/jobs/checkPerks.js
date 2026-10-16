import plan from '../services/plan.js';
import recheckHolders from '../services/recheckHolders.js';
import zspPerk from '../billing/zspPerk.js';
import adminHoldings from '../billing/adminHoldings.js';
import publishPlan from '../billing/publishPlan.js';

let running = false;

// The NOX checks that run on a schedule rather than on a request: whether an admin still holds
// a Zero-State Pass (Pro), and whether members who joined as holders still hold enough. Each
// keeps its own interval; this only looks at the clock.
export default async function checkPerks(now = Date.now()) {
  if (running) return;
  running = true;
  try {
    if (plan.status(now).enforced && zspPerk.due(now)) {
      const before = plan.status(now);
      try {
        zspPerk.record(await adminHoldings(), now);
      } catch {
        // an unreachable node changes nothing; the perk runs on its last good check
      }
      const after = plan.status(now);
      if (before.unlocked !== after.unlocked || before.source !== after.source) publishPlan();
    }
    await recheckHolders({ now });
  } finally {
    running = false;
  }
}
