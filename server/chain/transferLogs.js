import rpc from './rpc.js';
import nodeReady from './nodeReady.js';
import transferLog from './transferLog.js';
import transferTopic from './transferTopic.js';

const hex = (n) => `0x${n.toString(16)}`;

// Every transfer of one token to one address within a block range. The node filters by the
// token contract and the indexed receiver; the result is checked again here, since a node is
// trusted to be correct about the chain but not to apply our filter.
export default async function transferLogs(token, to, fromBlock, toBlock) {
  await nodeReady();
  const receiver = `0x${to.slice(2).toLowerCase().padStart(64, '0')}`;
  const logs = await rpc('eth_getLogs', [{ address: token, topics: [transferTopic, null, receiver], fromBlock: hex(fromBlock), toBlock: hex(toBlock) }]);
  return (Array.isArray(logs) ? logs : [])
    .map(transferLog)
    .filter((t) => t && t.token === token.toLowerCase() && t.to === to.toLowerCase() && t.txHash && t.blockNumber !== null && t.blockNumber >= fromBlock && t.blockNumber <= toBlock);
}
