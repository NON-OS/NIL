import transferTopic from './transferTopic.js';

const TOPIC = /^0x[0-9a-f]{64}$/;
const WORD = /^0x[0-9a-f]{1,64}$/;

// One ERC-20 Transfer(from, to, value) log in plain terms, or null for anything else: removed
// logs, other events, and ERC-721 transfers (which index the token id as a fourth topic).
export default function transferLog(log) {
  if (!log || log.removed) return null;
  const topics = (log.topics ?? []).map((t) => String(t).toLowerCase());
  const data = String(log.data ?? '').toLowerCase();
  if (topics.length !== 3 || topics[0] !== transferTopic || !topics.every((t) => TOPIC.test(t)) || !WORD.test(data)) return null;
  return {
    token: String(log.address ?? '').toLowerCase(),
    logIndex: Number(BigInt(log.logIndex ?? '0x0')),
    from: `0x${topics[1].slice(-40)}`,
    to: `0x${topics[2].slice(-40)}`,
    value: BigInt(data),
    blockNumber: log.blockNumber ? Number(BigInt(log.blockNumber)) : null,
    blockHash: log.blockHash ? String(log.blockHash).toLowerCase() : null,
    txHash: log.transactionHash ? String(log.transactionHash).toLowerCase() : null,
  };
}
