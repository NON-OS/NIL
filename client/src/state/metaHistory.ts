import storage from '../lib/storage';
import keyScope from './keyScope';

const KEEP = 2000;
const slot = () => keyScope.slot('chat-meta');
type Seen = Record<string, [number, number]>;

// The newest signed name and settings this browser opened for each conversation, per workspace
// and account: the epoch they were sealed under and when they were signed. A server that later
// serves an older one, or none at all, is caught.
const metaHistory = {
  // true when (epoch, at) is older than one seen; with no record at all, when one was seen
  stale(channelId: string, epoch: number | null, at: number | null) {
    const here = slot();
    const seen = here ? storage.get<Seen>(here, {})[channelId] : undefined;
    if (!seen) return false;
    if (epoch === null || at === null) return true;
    return epoch < seen[0] || (epoch === seen[0] && at < seen[1]);
  },

  record(channelId: string, epoch: number, at: number) {
    const here = slot();
    if (!here) return;
    const all = storage.get<Seen>(here, {});
    const seen = all[channelId];
    if (seen && (seen[0] > epoch || (seen[0] === epoch && seen[1] >= at))) return;
    const entries = Object.entries({ ...all, [channelId]: [epoch, at] as [number, number] });
    storage.set(here, Object.fromEntries(entries.slice(-KEEP)));
  },
};

export default metaHistory;
