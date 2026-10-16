import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

const toBig = (hex) => (typeof hex === 'string' && /^0x[0-9a-f]*$/i.test(hex) && hex.length > 2 ? BigInt(hex) : 0n);

// ETH and one token's balance for an address, from the latest block.
export default async function balances(address, token) {
  await nodeReady();
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;
  const [eth, held] = await Promise.all([rpc('eth_getBalance', [address, 'latest']), token ? rpc('eth_call', [{ to: token, data }, 'latest']) : '0x0']);
  return { eth: toBig(eth), token: toBig(held) };
}
