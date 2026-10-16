import calls from './calls.mjs';
import mainnet from './mainnet.mjs';

const word = (hex, i) => BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

// NOX in USD at the current block from the chain itself: the NOX/WETH Uniswap V2 reserves times
// Chainlink's ETH/USD answer, as decimal text for PLAN_NOX_USD. A spot price, fine for a test
// rate; Nil's own oracle wants a time-weighted one.
export default async function noxUsd(rpc) {
  const reserves = await rpc('eth_call', [{ to: mainnet.noxWethV2Pair, data: `0x${calls.selector('getReserves()')}` }, 'latest']);
  const round = await rpc('eth_call', [{ to: mainnet.ethUsdFeed, data: `0x${calls.selector('latestRoundData()')}` }, 'latest']);
  // token0 is NOX and token1 is WETH, both with 18 decimals; the feed has 8
  const usd = (Number(word(reserves, 1)) / Number(word(reserves, 0))) * (Number(word(round, 1)) / 1e8);
  return usd.toPrecision(6);
}
