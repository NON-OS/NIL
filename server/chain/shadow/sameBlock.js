import verifierAsk from './verifierAsk.js';
import verifierHead from './verifierHead.js';
import beyondReach from './beyondReach.js';
import unproven from './unproven.js';

const NUMBER = /^0x[0-9a-f]+$/i;
const HASH = /^0x[0-9a-f]{64}$/i;

// The block the verifier proves as finalized, and the node's block at the same height. Used when
// the node's answer is for a height the light client can't prove: the node's head is usually a
// few blocks ahead of it. A finalized height can't be reorganised, so two honest sides always
// agree on its hash.
async function atFinalized(node) {
  const proof = await verifierAsk('eth_getBlockByNumber', ['finalized', false]);
  if (proof.verdict !== 'proven' || !NUMBER.test(String(proof.result?.number))) return { outcome: unproven(proof) };
  let told;
  try {
    told = await node('eth_getBlockByNumber', [proof.result.number, false]);
  } catch {
    return { outcome: { reason: 'node' } };
  }
  return HASH.test(String(told?.hash)) ? { told, proof } : { outcome: { reason: 'node' } };
}

// A block as the node gave it, by number, against the hash the verifier proves for that height.
// A node that says a block is final can't be caught saying it too early this way, only giving
// the wrong block for a height.
export default async function sameBlock(method, params, answer, node) {
  if (answer.result === null) return 'skipped';
  let told = answer.result;
  if (!told || !NUMBER.test(String(told.number)) || !HASH.test(String(told.hash))) return { reason: 'unreadable' };
  const head = await verifierHead();
  if (!head.number) return head.outcome;
  let proof = BigInt(told.number) > BigInt(head.number) ? null : await verifierAsk('eth_getBlockByNumber', [told.number, false]);
  if (!proof || beyondReach(proof)) {
    const finalized = await atFinalized(node);
    if (finalized.outcome) return finalized.outcome;
    ({ told, proof } = finalized);
  }
  if (proof.verdict !== 'proven' || !HASH.test(String(proof.result?.hash))) return unproven(proof);
  return proof.result.hash.toLowerCase() === told.hash.toLowerCase() ? 'same' : 'differs';
}
