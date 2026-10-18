import rpc from '../chain/rpc.js';
import nodeReady from '../chain/nodeReady.js';
import poolEvent from './poolEvent.js';

const hex = (n) => `0x${n.toString(16)}`;

// One pool's events of the given kinds (topics) within a block range, decoded. Every event in
// the range comes back, not just a team's own, so reading them tells the node and this server
// nothing about which deposits are whose.
export default async function poolLogs(pool, topics, fromBlock, toBlock) {
  await nodeReady();
  const logs = await rpc('eth_getLogs', [{ address: pool, topics: [topics], fromBlock: hex(fromBlock), toBlock: hex(toBlock) }]);
  return (Array.isArray(logs) ? logs : [])
    .map((log) => poolEvent(log, pool))
    .filter((e) => e && e.blockNumber !== null && e.blockNumber >= fromBlock && e.blockNumber <= toBlock);
}
