import config from '../config.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

// NOX held by an address, in the token's smallest unit. Read from the latest block.
export default async function balanceOf(address) {
  await nodeReady();
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;
  const result = await rpc('eth_call', [{ to: config.nox.token, data }, 'latest']);
  return typeof result === 'string' && /^0x[0-9a-f]+$/i.test(result) ? BigInt(result) : 0n;
}
