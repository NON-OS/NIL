import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Wallet sign-in. Smart-contract wallets are checked on the chain, and the timeout keeps a slow
// node from holding a sign-in open. A sign-in reset link works once, within its hours. Resetting
// an owner with no second admin to approve waits ownerResetWaitMs first, so the owner can cancel.
// Linking a wallet or making an access key needs a fresh signature from a linked wallet, good
// for confirmMs, and an access key lasts at most accessKeyMaxDays.
export default Object.freeze({
  chainTimeoutMs: envNumber('SIGNIN_CHAIN_TIMEOUT_SECONDS', 8, { min: 1, max: 60 }) * units.SECOND,
  resetHours: envNumber('SIGNIN_RESET_HOURS', 24, { min: 1, max: 168 }),
  ownerResetWaitMs: envNumber('SIGNIN_OWNER_RESET_WAIT_HOURS', 72, { min: 1, max: 720 }) * units.HOUR,
  confirmMs: envNumber('SIGNIN_CONFIRM_MINUTES', 5, { min: 1, max: 60 }) * 60 * units.SECOND,
  accessKeyMaxDays: envNumber('ACCESS_KEY_MAX_DAYS', 365, { min: 1, max: 3650 }),
});
