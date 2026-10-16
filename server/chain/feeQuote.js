import config from '../config.js';
import rpc from './rpc.js';

const big = (hex) => BigInt(hex ?? '0x0');

// What to offer for gas right now: twice the current base fee plus a tip, which keeps a
// transaction includable through several full blocks of rising fees. The tip is the node's
// suggestion, but never less than STEALTH_MIN_TIP_WEI: when blocks have room some nodes suggest
// nothing at all, and a transaction that tips nothing may never be picked up (geth's own pool
// turns it away).
export default async function feeQuote() {
  const [block, tip] = await Promise.all([rpc('eth_getBlockByNumber', ['latest', false]), rpc('eth_maxPriorityFeePerGas')]);
  const floor = BigInt(config.stealth.minTipWei);
  const priority = big(tip) > floor ? big(tip) : floor;
  return { maxPriorityFeePerGas: priority, maxFeePerGas: big(block?.baseFeePerGas) * 2n + priority };
}
