import rpc from './rpc.js';

const HEX = /^0x([0-9a-f]{2})*$/i;

// One read-only contract call. A revert, an empty answer or a node error comes back as null,
// so callers decide what a missing answer means instead of failing halfway.
export default async function ethCall(to, data, block = 'latest') {
  if (!to) return null;
  try {
    const result = await rpc('eth_call', [{ to, data }, block]);
    return typeof result === 'string' && HEX.test(result) && result.length > 2 ? result.toLowerCase() : null;
  } catch {
    return null;
  }
}
