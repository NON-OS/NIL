import plan from '../services/plan.js';
import seatsPaused from '../services/seatsPaused.js';

// Utilities that need an active subscription answer 402 when it has lapsed. Reading,
// exporting, paying bounties you already promised and finishing votes already opened are
// never behind this.
export default function requirePlan(req, res, next) {
  const status = plan.status();
  if (status.unlocked) return next();
  res.status(402).json({ error: seatsPaused(status) ?? 'This needs Nil Pro. An admin can renew it in Settings → Plan.', plan: true });
}
