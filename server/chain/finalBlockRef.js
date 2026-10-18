import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

const HASH = /^0x[0-9a-f]{64}$/;

// The newest block that can no longer be reorganised away, with its hash, so reads can name that
// exact block (EIP-1898) rather than whatever the node holds at that height. Nodes without the
// `finalized` tag fall back to NOX_FINALITY_DEPTH blocks under the head.
export default async function finalBlockRef() {
  await nodeReady();
  let block = null;
  try {
    block = await rpc('eth_getBlockByNumber', ['finalized', false]);
  } catch {
    // an "unknown block tag" error is the expected answer from a node without finality
  }
  if (typeof block?.number !== 'string') {
    const head = Number(BigInt(await rpc('eth_blockNumber')));
    block = await rpc('eth_getBlockByNumber', [`0x${Math.max(0, head - config.finality.depth).toString(16)}`, false]);
  }
  const hash = String(block?.hash ?? '').toLowerCase();
  if (typeof block?.number !== 'string' || !HASH.test(hash)) throw new HttpError(502, 'The Ethereum node didn’t say which block is final. Try again in a minute.');
  return { number: Number(BigInt(block.number)), hash };
}
