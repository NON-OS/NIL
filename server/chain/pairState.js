import ethCall from './ethCall.js';
import abiWord from './abiWord.js';
import selector from './selector.js';
import blockAt from './blockAt.js';

const GET_RESERVES = `0x${selector('getReserves()')}`;
const PRICE0 = `0x${selector('price0CumulativeLast()')}`;
const PRICE1 = `0x${selector('price1CumulativeLast()')}`;
const TOKEN0 = `0x${selector('token0()')}`;
const TOKEN1 = `0x${selector('token1()')}`;
const U32 = 1n << 32n;
const U256 = 1n << 256n;
const address = (hex) => (hex && hex.length >= 66 ? `0x${hex.slice(-40)}` : null);

// A Uniswap V2 pair's cumulative prices as they stand at one block, every read made at that same
// block. The pair only updates them on a trade, so the time since its last one is added at the
// current reserves, as Uniswap's own UniswapV2OracleLibrary does. price0 is token1 per token0 as
// a UQ112x112 number summed over seconds, price1 the reverse; both wrap around at 2^256 by design.
// Null when the pair can't be read or holds nothing.
export default async function pairState(pair, blockNumber) {
  const tag = `0x${blockNumber.toString(16)}`;
  const [reserves, price0, price1, token0, token1, block] = await Promise.all([
    ethCall(pair, GET_RESERVES, tag),
    ethCall(pair, PRICE0, tag),
    ethCall(pair, PRICE1, tag),
    ethCall(pair, TOKEN0, tag),
    ethCall(pair, TOKEN1, tag),
    blockAt(blockNumber),
  ]);
  const [reserve0, reserve1, last] = [0, 1, 2].map((i) => abiWord(reserves, i));
  const [c0, c1] = [abiWord(price0, 0), abiWord(price1, 0)];
  if (!block || !address(token0) || !address(token1) || c0 === null || c1 === null || !reserve0 || !reserve1 || last === null) return null;
  const time = BigInt(block.time / 1000);
  const elapsed = (time - last + U32) % U32;
  return {
    time: Number(time),
    token0: address(token0),
    token1: address(token1),
    price0: (c0 + ((reserve1 << 112n) / reserve0) * elapsed) % U256,
    price1: (c1 + ((reserve0 << 112n) / reserve1) * elapsed) % U256,
  };
}
