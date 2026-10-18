import config from '../config.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';
import selector from './selector.js';
import decodeRegistryMeta from '../stealth/decodeRegistryMeta.js';

const META_OF = selector('stealthMetaAddressOf(address,uint256)');
// ERC-5564 scheme 1: secp256k1 with view tags
const SCHEME = '1'.padStart(64, '0');

// The meta-address a wallet published in the ERC-6538 registry. A node that can't be reached,
// or sits on the wrong chain, is an error and never reads as "nothing registered".
export default async function readRegistryMeta(wallet) {
  await nodeReady();
  const data = `0x${META_OF}${wallet.slice(2).toLowerCase().padStart(64, '0')}${SCHEME}`;
  try {
    return decodeRegistryMeta(await rpc('eth_call', [{ to: config.stealth.registry, data }, 'latest']));
  } catch (err) {
    // the contract itself saying no is an answer: there's nothing usable there
    if (err.reverted) return { state: 'none' };
    throw err;
  }
}
