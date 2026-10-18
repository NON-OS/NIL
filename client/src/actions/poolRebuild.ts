import http from '../api/http';
import poolKey from '../state/poolKey';
import noteBook from '../lib/pools/noteBook';
import poolAccount from './poolAccount';
import type PoolEvent from '../types/PoolEvent';
import type PoolInfo from '../types/PoolInfo';

const kit = async () => (await import('../lib/pools/poolKit')).default;

// Rebuilds the team's notes from the chain: every pool event since the account was made, read
// a range at a time, matched here against the secrets the pool key gives. The server returns
// every team's events alike, so it never learns which are the team's. This is how notes come
// back after a lost save, a closed tab mid-payout, or a move to a new server.
export default async function poolRebuild(info: PoolInfo, startBlock: number, onProgress: (done: number) => void = () => {}) {
  const key = poolKey.get();
  if (!key) throw new Error('Open the team’s pool first.');
  const { masterKeys, rebuildNotes } = await kit();
  const keys = masterKeys(key);
  const assets = info.assets.filter((a) => a.pool && a.scope);
  const span = Math.max(1, info.head - startBlock + 1);
  for (const [i, asset] of assets.entries()) {
    const events: PoolEvent[] = [];
    for (let from = startBlock; from <= info.head; from += info.logRangeBlocks) {
      const to = Math.min(info.head, from + info.logRangeBlocks - 1);
      events.push(...(await http.post<{ events: PoolEvent[] }>(`/pools/${asset.symbol}/events`, { fromBlock: from, toBlock: to })).events);
      onProgress((i + (to - startBlock + 1) / span) / assets.length);
    }
    const found = rebuildNotes(keys, { symbol: asset.symbol, scope: asset.scope! }, events);
    await poolAccount.update((book) => noteBook.adopt(book, asset.scope!, found));
  }
}
