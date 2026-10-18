import config from '../config.js';
import rpc from '../chain/rpc.js';
import nodeReady from '../chain/nodeReady.js';
import assetPool from './assetPool.js';
import poolEvent from './poolEvent.js';

const TX = /^0x[0-9a-f]{64}$/;

// The pool events one transaction emitted, from the pools of this server's reward tokens: what
// a browser needs to note down a deposit it just made (its label and the value the pool
// credited after the vetting fee) or a ragequit.
export default async function poolReceipt(txHash) {
  const hash = String(txHash ?? '').toLowerCase();
  if (!TX.test(hash)) return { state: 'invalid' };
  await nodeReady();
  const receipt = await rpc('eth_getTransactionReceipt', [hash]);
  if (!receipt?.blockHash) return { state: 'unknown' };
  if (receipt.status !== '0x1') return { state: 'failed' };
  const pools = [];
  for (const asset of config.pools.assets) {
    const found = await assetPool.get(asset.symbol).catch(() => null);
    if (found?.pool) pools.push(found);
  }
  const events = pools.flatMap((p) => (receipt.logs ?? []).map((log) => poolEvent(log, p.pool)).filter((e) => e && e.type !== 'leaf').map((e) => ({ symbol: p.symbol, ...e })));
  return { state: 'mined', blockNumber: Number(BigInt(receipt.blockNumber)), events };
}
