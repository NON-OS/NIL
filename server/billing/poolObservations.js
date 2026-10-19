import billingState from './billingState.js';

const fromStored = (o) => ({ time: o.time, price0: BigInt(o.price0), price1: BigInt(o.price1) });

// The NOX pair's cumulative prices as Nil reads them every minute, kept for a few TWAP windows.
// A Uniswap V2 pair remembers only its latest cumulative price, so a time-weighted average needs
// an earlier reading of its own. Kept with billing's state, so a restart doesn't lose the window;
// pointing PLAN_NOX_POOL at another pool starts over.
const poolObservations = {
  list(pool) {
    const stored = billingState.get('poolObservations', null);
    return stored?.pool === pool ? stored.list.map(fromStored) : [];
  },

  // Readings go in time order whenever they were taken, so one read back from the chain's own
  // history (seedObservation.js) can sit before the ones recorded since.
  add(pool, { time, price0, price1 }, keepSeconds) {
    const list = poolObservations.list(pool);
    if (list.some((o) => o.time === time)) return;
    list.push({ time, price0, price1 });
    list.sort((a, b) => a.time - b.time);
    const newest = list.at(-1).time;
    const kept = list.filter((o) => o.time >= newest - keepSeconds).map((o) => ({ time: o.time, price0: String(o.price0), price1: String(o.price1) }));
    billingState.set('poolObservations', { pool, list: kept });
  },

  // The newest reading at least `seconds` before `time`, unless it's more than twice that old:
  // an average over a long recording gap would no longer be the window asked for.
  before(pool, time, seconds) {
    const found = poolObservations.list(pool).findLast((o) => o.time <= time - seconds);
    return found && found.time >= time - 2 * seconds ? found : null;
  },
};

export default poolObservations;
