import logLimited from '../lib/logLimited.js';
import poolKind from '../chain/poolKind.js';
import poolTwap from '../chain/poolTwap.js';
import pairTwap from './pairTwap.js';

const E36 = 10n ** 36n;

// The NOX pool's time-weighted price over `seconds`, as token1 per token0 in smallest units (a
// fraction num/den), whether PLAN_NOX_POOL is a Uniswap V2 pair or a V3 pool. Null when it
// can't be priced yet or at all.
export default async function poolPrice(pool, seconds) {
  const kind = await poolKind(pool);
  if (kind === 'v2') return pairTwap(pool, seconds);
  if (kind === 'v3') {
    const twap = await poolTwap(pool, seconds);
    if (!twap) return null;
    // 1.0001^tick is token1 per token0; a double carries it to about 15 significant digits,
    // far finer than any price shown or charged
    const scaled = Math.round(Math.pow(1.0001, twap.tick) * 1e36);
    return Number.isFinite(scaled) && scaled > 0 ? { token0: twap.token0, token1: twap.token1, num: BigInt(scaled), den: E36 } : null;
  }
  logLimited('billing:pool', 'warn', 'billing', 'PLAN_NOX_POOL answers neither like a Uniswap V2 pair nor like a V3 pool, or the Ethereum node didn’t answer. NOX is priced with PLAN_NOX_USD until it does.');
  return null;
}
