import envNumber from '../lib/envNumber.js';

// The holder door counts NOX held, NOX staked and Zero-State Passes (each worth this many NOX),
// and keeps checking members who came in through it.
export default Object.freeze({
  zspWorth: String(envNumber('HOLDER_ZSP_NOX', 100000)),
  recheckHours: envNumber('HOLDER_RECHECK_HOURS', 6, { min: 1 }),
  graceDays: envNumber('HOLDER_GRACE_DAYS', 3),
});
