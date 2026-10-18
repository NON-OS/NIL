import verifierAsk from './verifierAsk.js';
import unproven from './unproven.js';

const NUMBER = /^0x[0-9a-f]+$/i;
const QUANTITY = new Set(['eth_getBalance', 'eth_getTransactionCount']);

// The answer as a comparable string: a revert, a quantity as a number, or the hex as is.
function plain(method, answer) {
  if (answer.reverted || answer.error?.code === 3) return 'reverted';
  if (typeof answer.result !== 'string') return null;
  return QUANTITY.has(method) && NUMBER.test(answer.result) ? BigInt(answer.result).toString() : answer.result.toLowerCase();
}

// A state read (eth_call, a balance, a nonce, code) as the node gave it, against the verifier's
// proof of the same read at the same block. A read at a tag like "latest" names no block, and
// the node and the verifier may be a block apart, so it is asked again of both at the newest
// block the verifier has proven: the question is whether the node tells the truth about that
// state, and a block of difference must never look like a lie.
export default async function sameState(method, params, answer, node) {
  let asked = params;
  let nodeAnswer = answer;
  if (!NUMBER.test(String(params[1] ?? 'latest'))) {
    const head = await verifierAsk('eth_blockNumber', []);
    if (head.verdict !== 'proven' || !NUMBER.test(String(head.result))) return unproven(head);
    asked = [params[0], head.result];
    try {
      nodeAnswer = { result: await node(method, asked) };
    } catch (err) {
      if (!err.reverted) return 'unknown';
      nodeAnswer = { reverted: true };
    }
  }
  const proof = await verifierAsk(method, asked);
  if (proof.verdict !== 'proven') return unproven(proof);
  const [told, proven] = [plain(method, nodeAnswer), plain(method, proof)];
  if (told === null || proven === null) return 'unknown';
  return told === proven ? 'same' : 'differs';
}
