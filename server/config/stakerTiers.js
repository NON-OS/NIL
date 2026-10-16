import configWarning from '../lib/configWarning.js';

// "10000:10,100000:25": staking at least 10,000 NOX takes 10% off, 100,000 takes 25%.
export default function stakerTiers(raw) {
  if (!raw || raw === 'none') return Object.freeze([]);
  const tiers = raw.split(',').map((entry) => entry.trim().split(':'));
  const valid = tiers.every(([stake, percent]) => /^\d{1,15}$/.test(stake ?? '') && /^\d{1,2}$/.test(percent ?? '') && Number(stake) > 0 && Number(percent) > 0);
  if (!valid) {
    configWarning('PLAN_STAKER_TIERS isn’t a list of stake:percent pairs like 10000:10,100000:25 (percent below 100). Staker discounts are off.');
    return Object.freeze([]);
  }
  return Object.freeze(tiers.map(([stake, percent]) => Object.freeze({ stake, percent: Number(percent) })).sort((a, b) => Number(BigInt(a.stake) - BigInt(b.stake))));
}
