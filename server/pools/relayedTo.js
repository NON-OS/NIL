import config from '../config.js';
import rpc from '../chain/rpc.js';
import headBlock from '../chain/headBlock.js';
import poolAbi from './poolAbi.js';

const TOPIC = /^0x[0-9a-f]{64}$/;
const TX = /^0x[0-9a-f]{64}$/;
// the head moves on during a search, so it keeps this many blocks inside the node's window
const MARGIN = 100;
const hex = (n) => `0x${n.toString(16)}`;
const lower = (v) => String(v ?? '').toLowerCase();
const number = (v) => (/^0x[0-9a-f]+$/.test(lower(v)) ? Number(BigInt(v)) : null);

function relayed(log, recipient, from, to) {
  if (!log || log.removed || lower(log.address) !== config.pools.entrypoint) return null;
  const topics = (log.topics ?? []).map(lower);
  if (topics.length !== 4 || !topics.every((t) => TOPIC.test(t)) || topics[0] !== poolAbi.relayed || topics[2] !== recipient) return null;
  const blockNumber = number(log.blockNumber);
  const txHash = lower(log.transactionHash);
  if (!TX.test(txHash) || blockNumber === null || blockNumber < from || blockNumber > to) return null;
  return { txHash, blockNumber, logIndex: number(log.logIndex) ?? 0 };
}

// The transaction in which the entry contract relayed a withdrawal to this pool payout's
// one-time address, the first since the payout was started, or null if there's none yet. A
// relayer can send a withdrawal and still report a failure, so this is how Nil finds one it
// wasn't told about. Whether it pays the bounty is for verifyPayment to say, as for any payment.
//
// The node is asked about that one address. The receipt Nil reads next names it anyway, and a
// light client then proves the one block it's in rather than every relayed withdrawal in the
// range. The answer is checked again here, since a node is trusted to be right about the chain
// but not to apply the filter. Only blocks the node keeps logs for are read (with verified
// reads, only those the verifier can prove), PRIVACY_POOLS_SEARCH_BLOCKS at a time.
export default async function relayedTo(intent) {
  const recipient = `0x${intent.to_address.slice(2).toLowerCase().padStart(64, '0')}`;
  const head = await headBlock();
  const history = config.verification.required ? Math.min(config.nox.logHistoryBlocks, config.verification.historyBlocks) : config.nox.logHistoryBlocks;
  const step = config.pools.searchBlocks;
  for (let from = Math.max(0, intent.start_block ?? 0, head - history + MARGIN); from <= head; from += step) {
    const to = Math.min(head, from + step - 1);
    const logs = await rpc('eth_getLogs', [{ address: config.pools.entrypoint, topics: [poolAbi.relayed, null, recipient], fromBlock: hex(from), toBlock: hex(to) }]);
    const found = (Array.isArray(logs) ? logs : [])
      .map((log) => relayed(log, recipient, from, to))
      .filter(Boolean)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    if (found.length) return { txHash: found[0].txHash, blockNumber: found[0].blockNumber };
  }
  return null;
}
