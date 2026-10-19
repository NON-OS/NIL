import verifierAsk from './verifierAsk.js';
import unproven from './unproven.js';

const HASH = /^0x[0-9a-f]{64}$/i;

// Every receipt in one block, proven by the verifier against the block's receipts root, keyed
// by transaction hash. Or the outcome to report when they can't be had: why not, or "differs"
// when the verifier caught its own node lying.
export default async function provenReceipts(blockHash) {
  if (!HASH.test(String(blockHash))) return { outcome: { reason: 'unreadable' } };
  const proof = await verifierAsk('eth_getBlockReceipts', [blockHash]);
  if (proof.verdict !== 'proven' || !Array.isArray(proof.result)) return { outcome: unproven(proof) };
  return { receipts: new Map(proof.result.map((r) => [String(r.transactionHash).toLowerCase(), r])) };
}
