import verifierAsk from './verifierAsk.js';
import verifierHead from './verifierHead.js';
import beyondReach from './beyondReach.js';
import unproven from './unproven.js';

const NUMBER = /^0x[0-9a-f]+$/i;
const QUANTITY = new Set(['eth_getBalance', 'eth_getTransactionCount']);

// The answer as a comparable string: a revert, a quantity as a number, or the hex as is.
function plain(method, answer) {
  if (answer.reverted || answer.error?.code === 3) return 'reverted';
  if (typeof answer.result !== 'string') return null;
  return QUANTITY.has(method) && NUMBER.test(answer.result) ? BigInt(answer.result).toString() : answer.result.toLowerCase();
}

function compare(method, told, proof) {
  if (proof.verdict !== 'proven') return unproven(proof);
  const [a, b] = [plain(method, told), plain(method, proof)];
  if (a === null || b === null) return { reason: 'unreadable' };
  return a === b ? 'same' : 'differs';
}

// The same read asked again of both the node and the verifier at the newest block the verifier
// has proven. The question is whether the node tells the truth about that state, and a block of
// difference between the two must never look like a lie.
async function atHead(method, params, node, head) {
  const asked = [params[0], head];
  let told;
  try {
    told = { result: await node(method, asked) };
  } catch (err) {
    if (!err.reverted) return { reason: 'node' };
    told = { reverted: true };
  }
  return compare(method, told, await verifierAsk(method, asked));
}

// A state read (eth_call, a balance, a nonce, code) as the node gave it, against the verifier's
// proof of the same read. A read at a numbered block the light client has is checked at that
// block. One at a tag like "latest" or a block hash names nothing both sides agree on, and one at
// a block the light client can't prove (newer than its head, as the node's own head usually is
// for a few seconds, or older than it keeps) is asked again of both at the verifier's head.
export default async function sameState(method, params, answer, node) {
  const head = await verifierHead();
  if (!head.number) return head.outcome;
  const at = String(params[1] ?? 'latest');
  if (!NUMBER.test(at) || BigInt(at) > BigInt(head.number)) return atHead(method, params, node, head.number);
  const proof = await verifierAsk(method, params);
  if (beyondReach(proof)) return atHead(method, params, node, head.number);
  return compare(method, answer, proof);
}
