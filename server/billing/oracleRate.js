import config from '../config.js';
import feedPrice from '../chain/feedPrice.js';
import tokenDecimals from '../chain/tokenDecimals.js';
import poolPrice from './poolPrice.js';

const E18 = 10n ** 18n;

// NOX in USD from the chain alone: the NOX/WETH pool's time-weighted average price times
// Chainlink's ETH/USD answer. Returns USD per whole NOX scaled by 10^18, or null if any part
// can't be read or the pool isn't a NOX/WETH pool.
export default async function oracleRate(now = Date.now()) {
  const { pool, weth, ethUsdFeed, twapMinutes, feedMaxAgeMinutes } = config.billing.oracle;
  if (!pool || !weth || !ethUsdFeed) return null;
  const [price, feed, wethDecimals] = await Promise.all([poolPrice(pool, twapMinutes * 60), feedPrice(ethUsdFeed, feedMaxAgeMinutes * 60_000, now), tokenDecimals(weth)]);
  if (!price || !feed || wethDecimals === null) return null;

  const nox = config.nox.token;
  const pair = [price.token0, price.token1];
  if (!pair.includes(nox) || !pair.includes(weth)) return null;

  // WETH per NOX in smallest units, then per whole NOX in dollars
  const [num, den] = price.token0 === nox ? [price.num, price.den] : [price.den, price.num];
  if (!num || !den) return null;
  return (num * 10n ** BigInt(config.nox.decimals) * feed.answer * E18) / (den * 10n ** BigInt(wethDecimals) * 10n ** BigInt(feed.decimals));
}
