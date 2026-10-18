import crypto from 'node:crypto';
import config from '../config.js';
import billingState from './billingState.js';

const HOUR = 3_600_000;

// When the scheduled look at the admins' passes and stakes is next due. Each comes at a random
// moment between half an interval and a whole one (PLAN_PERK_CHECK_HOURS) after the last, and
// only the time of the last one is ever shown, so nobody can time a borrowed pass or stake to be
// there just for the check.
const perkChecks = {
  due(now = Date.now()) {
    const { nextAt } = billingState.get('perkChecks', { nextAt: null });
    return nextAt === null || now >= nextAt;
  },

  done(now = Date.now()) {
    const half = (config.billing.perkCheckHours * HOUR) / 2;
    billingState.set('perkChecks', { at: now, nextAt: now + half + crypto.randomInt(half + 1) });
  },
};

export default perkChecks;
