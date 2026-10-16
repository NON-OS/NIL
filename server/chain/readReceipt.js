import rpc from './rpc.js';
import nodeReady from './nodeReady.js';
import transferLog from './transferLog.js';

const HASH = /^0x[0-9a-f]{64}$/;

// A transaction as the canonical chain has it now: where it was mined and every ERC-20
// Transfer it emitted, each tagged with the contract that emitted it, so callers can insist on
// the real token rather than a look-alike. "unknown" means not mined (or reorganised out).
export default async function readReceipt(txHash) {
  await nodeReady();
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt || typeof receipt.blockHash !== 'string' || !HASH.test(receipt.blockHash.toLowerCase())) return { state: 'unknown' };
  const blockNumber = Number(BigInt(receipt.blockNumber));
  const blockHash = receipt.blockHash.toLowerCase();
  if (receipt.status !== '0x1') return { state: 'failed', blockNumber, blockHash };
  const transfers = (receipt.logs ?? []).map(transferLog).filter(Boolean);
  return { state: 'mined', blockNumber, blockHash, transfers };
}
