import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

// The node's current block number.
export default async function headBlock() {
  await nodeReady();
  return Number(BigInt(await rpc('eth_blockNumber')));
}
