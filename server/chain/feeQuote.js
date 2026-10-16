import rpc from './rpc.js';

const big = (hex) => BigInt(hex ?? '0x0');

// What to offer for gas right now: twice the current base fee plus the node's suggested tip,
// which keeps a transaction includable through several full blocks of rising fees.
export default async function feeQuote() {
  const [block, tip] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_maxPriorityFeePerGas')]);
  const priority = big(tip);
  return { maxPriorityFeePerGas: priority, maxFeePerGas: big(block?.baseFeePerGas) * 2n + priority };
}
