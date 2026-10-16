import formatUnits from './formatUnits.js';
import rewardToken from './rewardToken.js';

// "250 USDC", "1,000 NOX": an amount in a reward token's smallest unit, for people to read.
export default function tokenAmount(value, symbol) {
  const token = rewardToken(symbol);
  return `${formatUnits(value, token.decimals)} ${token.symbol}`;
}
