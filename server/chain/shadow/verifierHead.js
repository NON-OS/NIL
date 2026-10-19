import verifierAsk from './verifierAsk.js';
import unproven from './unproven.js';

const NUMBER = /^0x[0-9a-f]+$/i;

// The newest block the verifier has proven, as a 0x number, or the outcome to report when it
// can't say.
export default async function verifierHead() {
  const head = await verifierAsk('eth_blockNumber', []);
  if (head.verdict !== 'proven' || !NUMBER.test(String(head.result))) return { outcome: unproven(head) };
  return { number: String(head.result).toLowerCase() };
}
