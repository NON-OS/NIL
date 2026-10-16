import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

// The hash and time (in milliseconds) of the canonical block at one height, or null if the
// node doesn't have it.
export default async function blockAt(number) {
  await nodeReady();
  const block = await rpc('eth_getBlockByNumber', [`0x${number.toString(16)}`, false]);
  if (typeof block?.hash !== 'string' || typeof block?.timestamp !== 'string') return null;
  return { hash: block.hash.toLowerCase(), time: Number(BigInt(block.timestamp)) * 1000 };
}
