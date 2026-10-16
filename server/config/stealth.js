import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import units from './units.js';
import ADDRESS_RULE from './addressRule.js';

// Private payouts (ERC-5564 stealth addresses). The announcer is the standard's singleton, the
// same address on every chain it's deployed to, which is why it alone keeps its default on other
// chains. The top-up is ETH the payer sends along so the contributor can move the tokens without
// first funding the one-time address from a known wallet.
const STEALTH_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';

function announcer(value) {
  if (validAddress(value)) return value.toLowerCase();
  if (value) configWarning(`STEALTH_ANNOUNCER isn’t a valid Ethereum address (${ADDRESS_RULE}). Using the default, ${STEALTH_ANNOUNCER}.`);
  return STEALTH_ANNOUNCER.toLowerCase();
}

const env = process.env;

export default Object.freeze({
  announcer: announcer((env.STEALTH_ANNOUNCER ?? '').trim()),
  gasTopUpWei: /^\d+$/.test(env.STEALTH_GAS_TOPUP_WEI ?? '') ? env.STEALTH_GAS_TOPUP_WEI : '300000000000000',
  // the least tip a move out of a one-time address offers, whatever the node suggests
  minTipWei: /^\d+$/.test(env.STEALTH_MIN_TIP_WEI ?? '') ? env.STEALTH_MIN_TIP_WEI : '50000000',
  // how long a confirmed payout keeps being checked for a late announcement
  announceCheckDays: envNumber('STEALTH_ANNOUNCE_CHECK_DAYS', 7),
  // payout balances are looked up one address at a time, at random moments within this window
  balanceSpreadMs: envNumber('STEALTH_BALANCE_SPREAD_SECONDS', 1800, { min: 1 }) * units.SECOND,
});
