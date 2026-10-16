import config from '../config.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

// The newest block that can no longer be reorganised away. Nodes that don't know the
// `finalized` tag (older clients, chains without finality) fall back to a fixed depth under
// the head, NOX_FINALITY_DEPTH.
export default async function finalizedBlock() {
  await nodeReady();
  try {
    const block = await rpc('eth_getBlockByNumber', ['finalized', false]);
    if (typeof block?.number === 'string') return Number(BigInt(block.number));
  } catch {
    // an "unknown block tag" error is the expected answer from a node without finality
  }
  return Number(BigInt(await rpc('eth_blockNumber'))) - config.finality.depth;
}
