import calls from '../calls.mjs';

// Uniswap v3 on Sepolia (github.com/Uniswap/v3-periphery deploys.md): SwapRouter02, QuoterV2,
// WETH and the 0.05% WETH/USDC pool, which held about 4M test USDC on 18 October 2026.
const ROUTER = '0x3bfa4769fb09eefc5a80d6e87c3b9c650f7ae48e';
const QUOTER = '0xed1f6473345f45b75f8179591dd5ba1888cf2fb3';
const WETH = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
const FEE = 500;
// a single-pool exactInputSingle that wraps the ETH it's sent uses well under this
const SWAP_GAS = 250_000n;
const word = (v) => calls.word(v);

// Swaps a little of the test wallet's Sepolia ETH for Circle's test USDC, for when the faucet
// isn't at hand. It quotes first and swaps only if the quote clears `least`, and the swap itself
// refuses to deliver less than that.
export default async function swapForUsdc({ rpc, wallet, chain, usdc, ethIn, least }) {
  const weth = await rpc('eth_call', [{ to: ROUTER, data: `0x${calls.selector('WETH9()')}` }, 'latest']);
  if (`0x${weth.slice(-40)}` !== WETH) throw new Error('SwapRouter02 on this chain names another WETH; not swapping');
  const quoteData = `0x${calls.selector('quoteExactInputSingle((address,address,uint256,uint24,uint160))')}${word(WETH)}${word(usdc)}${word(ethIn)}${word(FEE)}${word(0)}`;
  const quoted = BigInt((await rpc('eth_call', [{ to: QUOTER, data: quoteData }, 'latest'])).slice(0, 66));
  if (quoted < least) throw new Error(`the pool quotes ${Number(quoted) / 1e6} USDC for ${Number(ethIn) / 1e18} ETH, under the ${Number(least) / 1e6} needed; not swapping`);
  const data = `0x${calls.selector('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))')}${word(WETH)}${word(usdc)}${word(FEE)}${word(wallet.address)}${word(ethIn)}${word(least)}${word(0)}`;
  const hash = await wallet.send({ to: ROUTER, data, value: ethIn, gas: SWAP_GAS });
  const receipt = await chain.receipt(hash);
  if (receipt.status !== '0x1') throw new Error(`the swap ${hash} failed`);
  return { hash, quoted };
}
