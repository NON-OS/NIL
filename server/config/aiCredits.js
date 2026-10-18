import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Anonymous AI requests. A proof names a group root; the newest few roots stay good for a short
// while after the member list changes, so a request already being proven isn't refused.
export default Object.freeze({
  rootWindowMs: envNumber('AI_CREDIT_ROOT_MINUTES', 10, { min: 1, max: 1440 }) * units.MINUTE,
  roots: envNumber('AI_CREDIT_ROOTS', 4, { min: 1, max: 64 }),
  // nobody can be told apart here, so the only per-caller limit is by address
  perAddressPerMinute: envNumber('AI_CREDIT_PER_ADDRESS_PER_MINUTE', 60, { min: 1 }),
  // daily totals admins see; nothing else about these requests is kept past their day
  usageDays: envNumber('AI_CREDIT_USAGE_DAYS', 30, { min: 1, max: 366 }),
});
