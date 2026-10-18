import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import ethCall from '../chain/ethCall.js';
import abiWord from '../chain/abiWord.js';
import poolAbi from './poolAbi.js';

const CACHE_MS = 10 * 60_000;
const cache = new Map();
const word = (address) => address.slice(2).padStart(64, '0');
const unreadable = () => new HttpError(502, 'Nil couldn’t read the Privacy Pools contracts from its Ethereum node. Try again in a minute.');
const addressAt = (hex, i) => {
  const w = abiWord(hex, i);
  return w === null ? null : `0x${w.toString(16).padStart(40, '0')}`;
};

// What the entry contract says about one reward token: its pool, the pool's scope, the least
// deposit and the vetting and relay fee limits. The pool has to agree it holds that token and
// answers to this entry contract, and match the pool the operator or the network named, so a
// payout is only ever checked against the one real pool.
async function read(asset) {
  const conf = await ethCall(config.pools.entrypoint, `0x${poolAbi.assetConfig}${word(asset.token)}`);
  const pool = conf && addressAt(conf, 0);
  if (!pool) throw unreadable();
  if (/^0x0+$/.test(pool)) return { problem: `Privacy Pools has no pool for ${asset.symbol} yet. Only its entry contract’s owner can add one.` };
  if (asset.pool && asset.pool !== pool) return { problem: `The entry contract’s ${asset.symbol} pool isn’t the one this server names, so ${asset.symbol} can’t be paid privately until the operator checks it.` };
  const [scope, held, entry, dead] = await Promise.all(['scope', 'asset', 'entrypoint', 'dead'].map((k) => ethCall(pool, `0x${poolAbi[k]}`)));
  if (!scope && !held && !entry) throw unreadable();
  if (addressAt(held, 0) !== asset.token || addressAt(entry, 0) !== config.pools.entrypoint || abiWord(scope, 0) === null) {
    return { problem: `The ${asset.symbol} pool didn’t answer as a Privacy Pools pool for this token should.` };
  }
  if (abiWord(dead, 0)) return { problem: `The ${asset.symbol} pool is winding down and takes no new deposits.`, pool, scope: abiWord(scope, 0), dead: true };
  return {
    pool,
    scope: abiWord(scope, 0),
    minimumDeposit: abiWord(conf, 1),
    vettingFeeBps: abiWord(conf, 2),
    maxRelayFeeBps: abiWord(conf, 3),
  };
}

// The pool for a reward token symbol. Answers are kept for ten minutes; a node error isn't kept,
// it throws.
const assetPool = {
  async get(symbol) {
    const asset = config.pools.assets.find((a) => a.symbol === symbol);
    if (!asset) throw HttpError.badRequest(`${symbol} isn’t one of the tokens this server pays bounties in.`);
    const held = cache.get(symbol);
    if (held && held.at > Date.now() - CACHE_MS) return held.value;
    const found = await read(asset);
    const value = Object.freeze({ symbol, token: asset.token, decimals: asset.decimals, ...found });
    cache.set(symbol, { at: Date.now(), value });
    return value;
  },

  // the pool, or a 409 that says why this token can't go through one
  async usable(symbol) {
    const found = await assetPool.get(symbol);
    if (found.problem) throw new HttpError(409, found.problem);
    return found;
  },

  forget: () => cache.clear(),
};

export default assetPool;
