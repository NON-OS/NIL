import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import units from './units.js';
import ADDRESS_RULE from './addressRule.js';

// Private payouts (ERC-5564 stealth addresses). The announcer and the ERC-6538 registry are
// singletons, at the same address on every chain they're deployed to, which is why they keep
// their defaults on other chains. The top-up is ETH the payer sends along so the contributor can
// move the tokens without first funding the one-time address from a known wallet.
const STEALTH_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
const STEALTH_REGISTRY = '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538';

const env = process.env;

function singleton(name, fallback, { canBeOff = false } = {}) {
  const value = (env[name] ?? '').trim();
  if (canBeOff && value === 'off') return null;
  if (validAddress(value)) return value.toLowerCase();
  if (value) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). Using the default, ${fallback}.`);
  return fallback.toLowerCase();
}

export default Object.freeze({
  announcer: singleton('STEALTH_ANNOUNCER', STEALTH_ANNOUNCER),
  // where wallets publish meta-addresses for anyone to pay; null when "off"
  registry: singleton('STEALTH_REGISTRY', STEALTH_REGISTRY, { canBeOff: true }),
  // how long a meta-address read from the registry is reused before it's read again
  registryCacheMs: envNumber('STEALTH_REGISTRY_CACHE_SECONDS', 300, { min: 1 }) * units.SECOND,
  gasTopUpWei: /^\d+$/.test(env.STEALTH_GAS_TOPUP_WEI ?? '') ? env.STEALTH_GAS_TOPUP_WEI : '300000000000000',
  // the least tip a move out of a one-time address offers, whatever the node suggests
  minTipWei: /^\d+$/.test(env.STEALTH_MIN_TIP_WEI ?? '') ? env.STEALTH_MIN_TIP_WEI : '50000000',
  // how long a confirmed payout keeps being checked for a late announcement
  announceCheckDays: envNumber('STEALTH_ANNOUNCE_CHECK_DAYS', 7),
  // payout balances are looked up one address at a time, at random moments within this window
  balanceSpreadMs: envNumber('STEALTH_BALANCE_SPREAD_SECONDS', 1800, { min: 1 }) * units.SECOND,
});
