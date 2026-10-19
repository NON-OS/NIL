import logLimited from '../lib/logLimited.js';
import pairState from '../chain/pairState.js';
import poolObservations from './poolObservations.js';

// Ethereum's slot time, only for a first guess at how many blocks back the window starts; the
// blocks' own timestamps decide.
const SLOT_SECONDS = 12;
// a failed read is tried again once the head has moved on by about a minute
const RETRY_BLOCKS = 5;
const failedAt = new Map();

// A reading of a Uniswap V2 pair from the chain's own history, for a workspace that hasn't
// recorded the pair for a whole window yet: its cumulative prices at a block at least `seconds`
// older than `now`, read by historical eth_call. The pair's cumulative prices are the same
// numbers Nil records every minute, so the average over them is the same time-weighted price a
// full recording would give, never a spot price. Kept with the recorded readings, which take
// over as they age. Null when the node won't serve old state, or the pair didn't exist then.
export default async function seedObservation(pair, now, head, seconds) {
  if (head < (failedAt.get(pair) ?? -Infinity) + RETRY_BLOCKS) return null;
  let block = head - Math.ceil(seconds / SLOT_SECONDS) - 1;
  for (let tries = 0; tries < 3 && block > 0; tries++) {
    const state = await pairState(pair, block);
    if (!state) break;
    const short = state.time - (now.time - seconds);
    if (short <= 0) {
      // more than two windows back is no longer the window asked for
      if (state.time < now.time - 2 * seconds) break;
      poolObservations.add(pair, state, 3 * seconds);
      return state;
    }
    block -= Math.ceil(short / SLOT_SECONDS) + 1;
  }
  failedAt.set(pair, head);
  logLimited('billing:seed', 'info', 'billing', `The NOX pool’s prices from ${Math.round(seconds / 60)} minutes ago couldn’t be read from the Ethereum node, so NOX is priced once Nil has recorded the pool itself for that long.`);
  return null;
}
