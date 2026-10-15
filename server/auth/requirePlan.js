import config from '../config.js';
import plan from '../services/plan.js';

// Utilities that need an active subscription answer 402 when it has lapsed. Reading,
// exporting and paying bounties you already promised are never behind this.
export default function requirePlan(req, res, next) {
  if (plan.status().unlocked) return next();
  res.status(402).json({ error: `This needs an active NØNOS subscription. An admin can renew it in Settings → Plan with ${config.nox.symbol}.`, plan: true });
}
