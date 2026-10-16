import config from '../config.js';

// The staker discount for a stake in NOX's smallest unit: the highest tier it reaches.
export default function stakerPercent(staked) {
  const unit = 10n ** BigInt(config.nox.decimals);
  let percent = 0;
  for (const tier of config.billing.stakerTiers) if (BigInt(staked) >= BigInt(tier.stake) * unit) percent = Math.max(percent, tier.percent);
  return percent;
}
