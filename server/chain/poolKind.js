import ethCall from './ethCall.js';
import selector from './selector.js';

const GET_RESERVES = selector('getReserves()');
const OBSERVE = selector('observe(uint32[])');
const word = (n) => n.toString(16).padStart(64, '0');
const known = new Map();

// Whether an address is a Uniswap V2 pair ('v2') or a V3 pool ('v3'), found by asking: a pair
// answers getReserves() with three words, a V3 pool answers observe([0]). Null for anything else,
// which is also what a node that doesn't answer looks like, so only a real answer is remembered.
export default async function poolKind(pool) {
  if (known.has(pool)) return known.get(pool);
  let kind = null;
  const reserves = await ethCall(pool, `0x${GET_RESERVES}`);
  if (reserves?.length === 2 + 3 * 64) kind = 'v2';
  else if (await ethCall(pool, `0x${OBSERVE}${word(32)}${word(1)}${word(0)}`)) kind = 'v3';
  if (kind) known.set(pool, kind);
  return kind;
}
