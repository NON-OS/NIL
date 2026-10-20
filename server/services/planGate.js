import HttpError from '../lib/HttpError.js';
import plan from './plan.js';
import seatsPaused from './seatsPaused.js';

// The same check as requirePlan, for code paths that aren't whole routes.
export default function planGate(what) {
  const status = plan.status();
  if (!status.unlocked) throw new HttpError(402, seatsPaused(status) ?? `${what} needs Nil Pro. An admin can renew it in Settings → Plan.`);
}
