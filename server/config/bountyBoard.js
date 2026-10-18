import envNumber from '../lib/envNumber.js';

// The public bounty board. Applying takes nothing but a wallet, and wallets are free, so these
// keep one person with many wallets from burying a bounty: applications waiting on one bounty,
// applications one wallet may have waiting on this server, and new applications one bounty
// takes in an hour.
export default Object.freeze({
  maxPending: envNumber('BOUNTY_MAX_PENDING_APPLICATIONS', 100, { min: 1 }),
  perWallet: envNumber('BOUNTY_APPLICATIONS_PER_WALLET', 5, { min: 1 }),
  perHour: envNumber('BOUNTY_APPLICATIONS_PER_HOUR', 20, { min: 1 }),
});
