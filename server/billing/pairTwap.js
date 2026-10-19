import headBlock from '../chain/headBlock.js';
import pairState from '../chain/pairState.js';
import poolObservations from './poolObservations.js';
import seedObservation from './seedObservation.js';

const U256 = 1n << 256n;

// A Uniswap V2 pair's time-weighted price over at least the last `seconds`: its cumulative price
// now against one Nil recorded that long ago, as token1 per token0 in smallest units (num/den).
// A workspace that hasn't recorded the pair that long reads the earlier cumulative price from
// the chain's history instead. Null when neither exists, so a pair is never priced off a
// moment's spot price, which one trade can push anywhere.
export default async function pairTwap(pair, seconds) {
  const head = await headBlock();
  const now = await pairState(pair, head);
  if (!now) return null;
  const then = poolObservations.before(pair, now.time, seconds) ?? (await seedObservation(pair, now, head, seconds));
  if (!then) return null;
  return { token0: now.token0, token1: now.token1, num: (now.price0 - then.price0 + U256) % U256, den: BigInt(now.time - then.time) << 112n };
}
