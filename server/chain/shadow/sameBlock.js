import verifierAsk from './verifierAsk.js';
import unproven from './unproven.js';

const NUMBER = /^0x[0-9a-f]+$/i;

// A block as the node gave it, by number, against the hash the verifier proves for that height.
// A node that says a block is final can't be caught saying it too early this way, only giving
// the wrong block for a height.
export default async function sameBlock(method, params, answer) {
  const told = answer.result;
  if (!told || !NUMBER.test(String(told.number)) || typeof told.hash !== 'string') return 'unknown';
  const proof = await verifierAsk('eth_getBlockByNumber', [told.number, false]);
  if (proof.verdict !== 'proven' || typeof proof.result?.hash !== 'string') return unproven(proof);
  return proof.result.hash.toLowerCase() === told.hash.toLowerCase() ? 'same' : 'differs';
}
