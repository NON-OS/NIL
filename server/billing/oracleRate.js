import config from '../config.js';
import poolTwap from '../chain/poolTwap.js';
import feedPrice from '../chain/feedPrice.js';
import tokenDecimals from '../chain/tokenDecimals.js';

const E36 = 10n ** 36n;

// NOX in USD from the chain alone: the NOX/WETH pool's time-weighted average price times
// Chainlink's ETH/USD answer. Returns USD per whole NOX scaled by 10^18, or null if any part
// can't be read or the pool isn't a NOX/WETH pool.
export default async function oracleRate(now = Date.now()) {
  const { pool, weth, ethUsdFeed, twapMinutes, feedMaxAgeMinutes } = config.billing.oracle;
  if (!pool || !weth || !ethUsdFeed) return null;
  const [twap, feed, wethDecimals] = await Promise.all([poolTwap(pool, twapMinutes * 60), feedPrice(ethUsdFeed, feedMaxAgeMinutes * 60_000, now), tokenDecimals(weth)]);
  if (!twap || !feed || wethDecimals === null) return null;

  const nox = config.nox.token;
  const pair = [twap.token0, twap.token1];
  if (!pair.includes(nox) || !pair.includes(weth)) return null;

  // 1.0001^tick is token1 per token0 in smallest units; a double carries it to about 15
  // significant digits, far finer than any price shown or charged
  const rawWethPerNox = Math.pow(1.0001, twap.token0 === nox ? twap.tick : -twap.tick);
  const wethPerNox = rawWethPerNox * 10 ** (config.nox.decimals - wethDecimals);
  if (!Number.isFinite(wethPerNox) || wethPerNox <= 0) return null;
  const wethPerNoxE36 = BigInt(Math.round(wethPerNox * 1e36));
  return (wethPerNoxE36 * feed.answer * 10n ** 18n) / (E36 * 10n ** BigInt(feed.decimals));
}
