import ethCall from './ethCall.js';
import abiWord from './abiWord.js';
import selector from './selector.js';

const OBSERVE = selector('observe(uint32[])');
const TOKEN0 = selector('token0()');
const TOKEN1 = selector('token1()');
const MAX_TICK = 887272n;
const pad = (n) => n.toString(16).padStart(64, '0');
const address = (hex) => (hex && hex.length >= 66 ? `0x${hex.slice(-40)}` : null);

// The time-weighted average tick of a Uniswap V3 pool over the last `seconds`, and its two
// tokens. A single block can push the spot price anywhere; moving a half-hour average costs
// holding the price there for the whole half hour. Null when the pool can't answer (too few
// observations stored, not a pool, not deployed on this chain).
export default async function poolTwap(pool, seconds) {
  const query = `0x${OBSERVE}${pad(32n)}${pad(2n)}${pad(BigInt(seconds))}${pad(0n)}`;
  const [observed, token0, token1] = await Promise.all([ethCall(pool, query), ethCall(pool, `0x${TOKEN0}`), ethCall(pool, `0x${TOKEN1}`)]);
  if (!observed || !address(token0) || !address(token1)) return null;

  // observe returns (int56[] tickCumulatives, uint160[] secondsPerLiquidity): two offsets, then
  // the first array's length and its items
  const offset = abiWord(observed, 0);
  if (offset === null || offset % 32n) return null;
  const at = Number(offset / 32n);
  const [length, past, now] = [abiWord(observed, at), abiWord(observed, at + 1, { signed: true }), abiWord(observed, at + 2, { signed: true })];
  if (length !== 2n || past === null || now === null) return null;

  // the same rounding as Uniswap's OracleLibrary: toward negative infinity
  const delta = now - past;
  let tick = delta / BigInt(seconds);
  if (delta < 0n && delta % BigInt(seconds) !== 0n) tick -= 1n;
  if (tick > MAX_TICK || tick < -MAX_TICK) return null;
  return { tick: Number(tick), token0: address(token0), token1: address(token1) };
}
