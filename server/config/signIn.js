import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Wallet sign-in. Smart-contract wallets are checked on the chain, and the timeout keeps a slow
// node from holding a sign-in open. A sign-in reset link works once, within its hours.
export default Object.freeze({
  chainTimeoutMs: envNumber('SIGNIN_CHAIN_TIMEOUT_SECONDS', 8, { min: 1, max: 60 }) * units.SECOND,
  resetHours: envNumber('SIGNIN_RESET_HOURS', 24, { min: 1, max: 168 }),
});
