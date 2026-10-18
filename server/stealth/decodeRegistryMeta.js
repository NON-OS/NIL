import parseMeta from './parseMeta.js';

const HEX = /^([0-9a-f]{2})*$/;
// what ERC-5564 scheme 1 publishes: the compressed spending key, then the compressed viewing key
const META_BYTES = 66;

// What the ERC-6538 registry answered to stealthMetaAddressOf(wallet, 1): ABI-encoded bytes.
// Empty bytes, or no answer at all where the registry isn't deployed, means nothing is
// registered. Anything else has to pass the same checks as a meta-address published in Nil.
export default function decodeRegistryMeta(result) {
  const body = typeof result === 'string' ? result.replace(/^0x/, '').toLowerCase() : '';
  if (!body) return { state: 'none' };
  const invalid = { state: 'invalid' };
  if (!HEX.test(body) || body.length < 128) return invalid;
  const size = BigInt(body.length / 2);
  const offset = BigInt(`0x${body.slice(0, 64)}`);
  if (offset + 32n > size) return invalid;
  const at = Number(offset) * 2;
  const length = BigInt(`0x${body.slice(at, at + 64)}`);
  if (length === 0n) return { state: 'none' };
  if (length !== BigInt(META_BYTES) || offset + 32n + length > size) return invalid;
  const metaAddress = `st:eth:0x${body.slice(at + 64, at + 64 + META_BYTES * 2)}`;
  try {
    parseMeta(metaAddress);
  } catch {
    return invalid;
  }
  return { state: 'found', metaAddress };
}
