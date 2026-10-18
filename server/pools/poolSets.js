import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import ethCall from '../chain/ethCall.js';
import abiWord from '../chain/abiWord.js';
import headBlock from '../chain/headBlock.js';
import poolFetch from './poolFetch.js';
import poolLogs from './poolLogs.js';
import poolAbi from './poolAbi.js';
import fieldList from './fieldList.js';

const cache = new Map();
const busy = () => new HttpError(503, 'The pool is changing right now, so Nil can’t prove a withdrawal from it. Try again in a minute.');

// The provider's snapshot of the state tree can trail the chain by a few deposits. The missing
// leaves come from the pool's own LeafInserted events, in order and without gaps.
async function stateLeaves(found, fromAsp) {
  const [size, current] = await Promise.all([ethCall(found.pool, `0x${poolAbi.currentTreeSize}`), ethCall(found.pool, `0x${poolAbi.currentRoot}`)]);
  if (abiWord(size, 0) === null || abiWord(current, 0) === null) throw new HttpError(502, 'Nil couldn’t read the pool from its Ethereum node. Try again in a minute.');
  const want = Number(abiWord(size, 0));
  const leaves = fromAsp.slice(0, want);
  if (leaves.length < want) {
    const head = await headBlock();
    const span = Math.min(config.nox.logHistoryBlocks, config.pools.logRangeBlocks);
    const events = await poolLogs(found.pool, [poolAbi.leafInserted], Math.max(0, head - span + 1), head);
    for (const e of events.sort((a, b) => Number(a.index) - Number(b.index))) if (Number(e.index) === leaves.length) leaves.push(e.leaf);
  }
  if (leaves.length !== want) throw busy();
  return { leaves, root: abiWord(current, 0).toString() };
}

// What a browser needs to prove a withdrawal from one pool: every commitment in the pool's state
// tree and every label the association set approves, with the roots the chain holds for both.
// The browser builds both trees and refuses to prove unless it gets those exact roots (a
// withdrawal must use the entry contract's latest association root), so neither this server nor
// the provider can slip it a set of its own. Hashing tens of thousands of leaves is left to the
// browser that needs the tree anyway. The same answer serves every admin for a minute, and it's
// the same for every team, so asking for it says nothing about which deposits are whose.
export default async function poolSets(found) {
  const held = cache.get(found.pool);
  if (held && held.at > Date.now() - config.pools.setsCacheMs) return held.value;
  const scope = { 'X-Pool-Scope': found.scope.toString() };
  const res = await poolFetch('asp', `/${config.pools.chainId}/public/mt-leaves`, { headers: scope });
  const asp = res.ok ? fieldList(res.data?.aspLeaves) : null;
  const fromAsp = res.ok ? fieldList(res.data?.stateTreeLeaves) : null;
  if (!asp || !fromAsp) throw new HttpError(502, 'The association set provider sent something Nil can’t read. Try again in a minute.');
  const latest = abiWord(await ethCall(config.pools.entrypoint, `0x${poolAbi.latestRoot}`), 0);
  if (latest === null) throw new HttpError(502, 'Nil couldn’t read the entry contract from its Ethereum node. Try again in a minute.');
  const state = await stateLeaves(found, fromAsp);
  const value = { aspLeaves: asp, aspRoot: latest.toString(), stateLeaves: state.leaves, stateRoot: state.root };
  cache.set(found.pool, { at: Date.now(), value });
  return value;
}
