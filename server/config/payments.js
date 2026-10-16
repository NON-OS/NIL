import envNumber from '../lib/envNumber.js';

// Bounty payments start in Nil, which hands out the exact amount to send. That amount stays good
// for this many days (long enough for a multisig to collect its signatures), and a payment that
// was cancelled while stuck is still watched this long in case its transaction lands after all.
export default Object.freeze({
  intentDays: envNumber('PAYMENT_INTENT_DAYS', 14, { min: 1, max: 365 }),
  watchDays: envNumber('PAYMENT_WATCH_DAYS', 7, { min: 1, max: 365 }),
});
