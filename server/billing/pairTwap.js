import headBlock from '../chain/headBlock.js';
import pairState from '../chain/pairState.js';
import poolObservations from './poolObservations.js';

const U256 = 1n << 256n;

// A Uniswap V2 pair's time-weighted price over at least the last `seconds`: its cumulative price
// now against one Nil recorded that long ago, as token1 per token0 in smallest units (num/den).
// Null until such a recording exists, so a pair is never priced off a moment's spot price, which
// one trade can push anywhere.
export default async function pairTwap(pair, seconds) {
  const now = await pairState(pair, await headBlock());
  if (!now) return null;
  const then = poolObservations.before(pair, now.time, seconds);
  if (!then) return null;
  return { token0: now.token0, token1: now.token1, num: (now.price0 - then.price0 + U256) % U256, den: BigInt(now.time - then.time) << 112n };
}
