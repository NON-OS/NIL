import envNumber from '../lib/envNumber.js';

// The app starts with open work and recent history only. Finished tasks (done or canceled)
// touched within these days come along, but never more than the newest `recentClosedMax` of
// them; older ones load when a view asks for them.
export default Object.freeze({
  recentClosedDays: envNumber('RECENT_CLOSED_DAYS', 30),
  recentClosedMax: envNumber('RECENT_CLOSED_MAX', 1000, { min: 1 }),
});
