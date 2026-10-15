import HttpError from '../lib/HttpError.js';
import config from '../config.js';
import plan from './plan.js';

// The same check as requirePlan, for code paths that aren't whole routes.
export default function planGate(what) {
  if (!plan.status().unlocked) throw new HttpError(402, `${what} needs an active NØNOS subscription. An admin can renew it in Settings → Plan with ${config.nox.symbol}.`);
}
