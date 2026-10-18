import poolAbi from './poolAbi.js';

const TOPIC = /^0x[0-9a-f]{64}$/;
const SHAPES = {
  [poolAbi.deposited]: { type: 'deposit', indexed: 1, fields: ['commitment', 'label', 'value', 'precommitment'], who: 'depositor' },
  [poolAbi.withdrawn]: { type: 'withdrawal', indexed: 1, fields: ['value', 'nullifierHash', 'newCommitment'], who: 'processooor' },
  [poolAbi.ragequit]: { type: 'ragequit', indexed: 1, fields: ['commitment', 'label', 'value'], who: 'ragequitter' },
  [poolAbi.leafInserted]: { type: 'leaf', indexed: 0, fields: ['index', 'leaf', 'root'] },
};

// One Privacy Pools pool event in plain terms, with numbers as decimal strings, or null for
// anything else. Only events the given pool emitted count; another contract's lookalike doesn't.
export default function poolEvent(log, pool) {
  if (!log || log.removed || String(log.address ?? '').toLowerCase() !== pool) return null;
  const topics = (log.topics ?? []).map((t) => String(t).toLowerCase());
  const shape = SHAPES[topics[0]];
  const data = String(log.data ?? '').toLowerCase().replace(/^0x/, '');
  if (!shape || topics.length !== shape.indexed + 1 || !topics.every((t) => TOPIC.test(t)) || data.length !== shape.fields.length * 64 || !/^[0-9a-f]*$/.test(data)) return null;
  const out = { type: shape.type };
  if (shape.who) out[shape.who] = `0x${topics[1].slice(-40)}`;
  shape.fields.forEach((name, i) => (out[name] = BigInt(`0x${data.slice(i * 64, i * 64 + 64)}`).toString()));
  out.blockNumber = log.blockNumber ? Number(BigInt(log.blockNumber)) : null;
  out.txHash = log.transactionHash ? String(log.transactionHash).toLowerCase() : null;
  out.logIndex = log.logIndex ? Number(BigInt(log.logIndex)) : null;
  return out;
}
