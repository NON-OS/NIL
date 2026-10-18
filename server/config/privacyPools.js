import envFlag from './envFlag.js';
import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import chain from './chain.js';
import nox from './nox.js';
import rewards from './rewardTokens.js';
import units from './units.js';
import networks from './poolNetworks.js';
import ADDRESS_RULE from './addressRule.js';

// Private bounty payouts through Privacy Pools by 0xbow. Off unless PRIVACY_POOLS is on, and
// only on the chain Nil already reads, since the server verifies every payout with its own node.
const env = process.env;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

function networkName() {
  const raw = (env.PRIVACY_POOLS_NETWORK ?? '').trim().toLowerCase();
  const byChain = Object.keys(networks).find((name) => networks[name].chainId === chain.id) ?? null;
  if (!raw) return byChain;
  if (!networks[raw]) {
    configWarning(`PRIVACY_POOLS_NETWORK must be ${Object.keys(networks).join(' or ')}. Private pool payouts stay off.`);
    return null;
  }
  if (networks[raw].chainId !== chain.id) {
    configWarning(`PRIVACY_POOLS_NETWORK is ${raw}, but NOX_CHAIN_ID is ${chain.id}. Private pool payouts stay off.`);
    return null;
  }
  return raw;
}

function address(name, fallback) {
  const raw = (env[name] ?? '').trim();
  if (validAddress(raw)) return raw.toLowerCase();
  if (raw) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). ${fallback ? `Using the default, ${fallback}.` : 'Private pool payouts stay off.'}`);
  return fallback;
}

// The browser never talks to these hosts; the server does, on its behalf, so they must be https
// (plain http only for a relayer or provider on this machine).
function endpoint(name, fallback) {
  const raw = (env[name] ?? '').trim().replace(/\/+$/, '');
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const plainOk = url.protocol === 'http:' && LOCAL.has(url.hostname);
    if ((url.protocol === 'https:' || plainOk) && !url.username && !url.password && !url.search && !url.hash) return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {}
  configWarning(`${name} must be an https address with no login, query or fragment. ${fallback ? `Using the default, ${fallback}.` : 'Private pool payouts stay off.'}`);
  return fallback;
}

// Pools the operator names, as SYMBOL:poolAddress pairs. Each must match what the entry
// contract reports for that token, or that token can't be paid privately (see assetPool.js).
function pinned(value) {
  const out = {};
  for (const [i, entry] of value.split(',').map((e) => e.trim()).filter(Boolean).entries()) {
    const [symbol, pool, ...extra] = entry.split(':');
    if (!symbol || extra.length || !validAddress(pool)) configWarning(`PRIVACY_POOLS_POOLS entry ${i + 1} isn’t SYMBOL:poolAddress with a valid address (${ADDRESS_RULE}), so it’s left out.`);
    else out[symbol.toUpperCase()] = pool.toLowerCase();
  }
  return out;
}

// The entry contract is known even with the feature off, so payouts made while it was on keep
// being checked after an operator turns it off.
const wanted = envFlag('PRIVACY_POOLS', false);
const name = networkName();
const network = name ? networks[name] : null;
const entrypoint = network ? address('PRIVACY_POOLS_ENTRYPOINT', network.entrypoint) : null;
const relayer = wanted && network ? endpoint('PRIVACY_POOLS_RELAYER_URL', network.relayer) : null;
const asp = wanted && network ? endpoint('PRIVACY_POOLS_ASP_URL', network.asp) : null;
const named = pinned((env.PRIVACY_POOLS_POOLS ?? '').trim());
if (wanted && network && !relayer) configWarning(`PRIVACY_POOLS is on, but PRIVACY_POOLS_RELAYER_URL isn’t set and ${name} has no default relayer. Private pool payouts stay off.`);
if (wanted && !nox.enabled) configWarning('PRIVACY_POOLS is on, but on-chain features are off. Private pool payouts stay off.');

export default Object.freeze({
  enabled: Boolean(wanted && nox.enabled && network && entrypoint && relayer && asp),
  network: name,
  chainId: chain.id,
  entrypoint,
  relayerUrl: relayer,
  aspUrl: asp,
  // every reward token, with the pool the operator or the network defaults name for it; null
  // means the entry contract is asked, which is how a newly listed token (NOX, one day) works
  assets: Object.freeze(
    rewards.map((t) => Object.freeze({ symbol: t.symbol, token: t.address, decimals: t.decimals, pool: named[t.symbol] ?? network?.pools[t.address] ?? null })),
  ),
  // ask the relayer to turn part of its fee into ETH for the one-time address, so the
  // contributor can move the tokens without first funding it from a known wallet
  extraGas: envFlag('PRIVACY_POOLS_EXTRA_GAS', true),
  timeoutMs: envNumber('PRIVACY_POOLS_TIMEOUT_SECONDS', 15, { min: 1, max: 120 }) * units.SECOND,
  // a relayer answers a withdrawal only once it has sent it, and with extra gas once it's mined
  relayTimeoutMs: envNumber('PRIVACY_POOLS_RELAY_TIMEOUT_SECONDS', 180, { min: 10, max: 900 }) * units.SECOND,
  // a busy pool's tree runs to tens of thousands of leaves
  maxResponseBytes: envNumber('PRIVACY_POOLS_MAX_RESPONSE_MB', 16, { min: 1, max: 256 }) * units.MB,
  // association sets change a few times a day; one read serves every admin for this long
  setsCacheMs: envNumber('PRIVACY_POOLS_SETS_CACHE_SECONDS', 60, { min: 5 }) * units.SECOND,
  // blocks per pool event read when a browser rebuilds the team's notes from the chain
  logRangeBlocks: envNumber('PRIVACY_POOLS_LOG_RANGE_BLOCKS', 10_000, { min: 100 }),
});
