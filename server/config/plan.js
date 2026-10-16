import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import chain from './chain.js';
import nox from './nox.js';
import ADDRESS_RULE from './addressRule.js';

// A treasury that can't be used means community mode, said out loud. The value isn't repeated
// in the warning: a private key pasted here by mistake must not end up in the logs.
function planTreasury(value) {
  if (!value) return null;
  if (!validAddress(value)) {
    configWarning(`PLAN_TREASURY is set but isn’t a valid Ethereum address (${ADDRESS_RULE}). The subscription is off and every tool is unlocked (community mode) until it’s fixed.`);
    return null;
  }
  if (!nox.enabled) configWarning(`PLAN_TREASURY is set, but ${chain.off ? 'NOX_RPC_URL is off' : 'NOX_TOKEN is missing'}, so payments can’t be checked. The subscription is off and every tool is unlocked (community mode).`);
  return value.toLowerCase();
}

export default Object.freeze({
  treasury: planTreasury((process.env.PLAN_TREASURY ?? '').trim()),
  periodDays: envNumber('PLAN_PERIOD_DAYS', 30, { min: 1 }),
  graceDays: envNumber('PLAN_GRACE_DAYS', 7),
  freeSeats: envNumber('PLAN_FREE_SEATS', 5),
  maxPeriods: envNumber('PLAN_MAX_PERIODS', 24, { min: 1 }),
  trialDays: envNumber('PLAN_TRIAL_DAYS', 14),
});
