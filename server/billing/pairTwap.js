import config from '../config.js';
import headBlock from '../chain/headBlock.js';
import pairState from '../chain/pairState.js';
import poolObservations from './poolObservations.js';
import seedObservation from './seedObservation.js';

const U256 = 1n << 256n;

// a/b < c/d for positive fractions, without dividing
const below = (x, y) => x.num * y.den < y.num * x.den;

// A Uniswap V2 pair's time-weighted price over at least the last `seconds`, as token1 per token0
// in smallest units (num/den). The window is cut into PLAN_TWAP_PARTS stretches and the price is
// the median of their averages. A plain average moves by a spike's size times its share of the
// window, which on a thin pool is still a lot for one block bought and sold back; a spike that
// short lands in one stretch, and the median passes over it. With an even number of stretches
// the lower middle one counts, since a higher NOX price is the one that undercharges.
//
// The readings come from Nil's own minute-by-minute record, or, for a workspace that hasn't
// recorded the pair that long, from the chain's history. Null when neither has them, so a pair is
// never priced off a moment's spot price.
export default async function pairTwap(pair, seconds, parts = config.billing.oracle.twapParts) {
  const head = await headBlock();
  const now = await pairState(pair, head);
  if (!now) return null;
  const step = Math.max(1, Math.floor(seconds / parts));
  const points = [now];
  for (let i = 1; i <= parts; i++) {
    const back = i === parts ? seconds : i * step;
    const then = poolObservations.before(pair, now.time, back) ?? (await seedObservation(pair, now, head, back, 3 * seconds));
    if (!then) return null;
    points.push(then);
  }
  const stretches = points
    .slice(1)
    .map((then, i) => ({ num: (points[i].price0 - then.price0 + U256) % U256, den: BigInt(points[i].time - then.time) << 112n }))
    .filter((s) => s.den > 0n);
  if (!stretches.length) return null;
  stretches.sort((x, y) => (below(x, y) ? -1 : below(y, x) ? 1 : 0));
  const middle = stretches[Math.floor((stretches.length - 1) / 2)];
  return { token0: now.token0, token1: now.token1, num: middle.num, den: middle.den };
}
