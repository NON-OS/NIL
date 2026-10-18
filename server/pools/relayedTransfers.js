import poolAbi from './poolAbi.js';
import transferLog from '../chain/transferLog.js';

const TOPIC = /^0x[0-9a-f]{64}$/;
const lower = (v) => String(v ?? '').toLowerCase();
const addressIn = (topic) => `0x${topic.slice(-40)}`;
const words = (data) => (lower(data).replace(/^0x/, '').match(/.{64}/g) ?? []).map((w) => BigInt(`0x${w}`));

function clean(logs) {
  return (logs ?? [])
    .filter((log) => log && !log.removed)
    .map((log, i) => ({ ...log, address: lower(log.address), topics: (log.topics ?? []).map(lower), order: log.logIndex !== undefined ? Number(BigInt(log.logIndex)) : i }))
    .filter((log) => log.topics.every((t) => TOPIC.test(t)))
    .sort((a, b) => a.order - b.order);
}

// The tokens a relayed Privacy Pools withdrawal delivered to `to`, from one transaction's logs.
// Each counts only when all three agree, in order: the configured pool emitted Withdrawn to the
// entry contract for the full amount; the entry contract then sent the token to `to`; and it
// emitted WithdrawalRelayed naming `to`, the token, that amount and its fee, with the transfer
// being exactly the amount less the fee. Lookalike contracts, other pools and other recipients
// add nothing, and a transaction can't count one withdrawal twice.
export default function relayedTransfers(logs, { entrypoint, pool, token, to }) {
  const sorted = clean(logs);
  const used = new Set();
  const out = [];
  for (const relay of sorted) {
    const [topic, , recipient, asset] = relay.topics;
    if (relay.address !== entrypoint || topic !== poolAbi.relayed || relay.topics.length !== 4) continue;
    if (addressIn(recipient) !== to || addressIn(asset) !== token) continue;
    const [gross, fee] = words(relay.data);
    if (gross === undefined || fee === undefined || fee > gross) continue;
    const net = gross - fee;
    const before = sorted.filter((log) => log.order < relay.order && !used.has(log.order));
    const withdrawn = before.findLast((log) => log.address === pool && log.topics[0] === poolAbi.withdrawn && log.topics.length === 2 && addressIn(log.topics[1]) === entrypoint && words(log.data)[0] === gross);
    if (!withdrawn) continue;
    const sent = before.find((log) => {
      if (log.order < withdrawn.order) return false;
      const t = transferLog(log);
      return t && t.token === token && t.from === entrypoint && t.to === to && t.value === net;
    });
    if (!sent) continue;
    used.add(withdrawn.order).add(sent.order);
    out.push({ token, from: entrypoint, to, value: net, gross, relayFee: fee });
  }
  return out;
}
