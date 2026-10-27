import http from '../../api/http';
import store from '../../state/store';
import storage from '../../lib/storage';
import keyScope from '../../state/keyScope';
import checkRoster from './checkRoster';
import type ChatRoster from '../../types/ChatRoster';
import type ChatChannelRow from '../../types/ChatChannelRow';

export interface Chain {
  rosters: ChatRoster[];
  // the first epoch whose list didn't check out, and every one after it, count for nothing
  broken: number | null;
  // the server showed a list other than one this browser checked before, or fewer epochs
  forked: boolean;
  keysRev: number;
}

type Row = { epoch: number; roster: string; proofs: string[]; wrappedKeys: string[] };

const chains = new Map<string, Promise<Chain>>();
// the newest list this browser checked for each conversation: its epoch and hash
const slot = () => keyScope.slot('chat-heads');

function remember(channelId: string, chain: Chain) {
  const here = slot();
  const head = chain.rosters[chain.rosters.length - 1];
  if (!here || !head) return chain;
  const heads = storage.get<Record<string, [number, string]>>(here, {});
  const seen = heads[channelId];
  const mine = seen && chain.rosters.find((r) => r.epoch === seen[0]);
  if (seen && ((mine && mine.hash !== seen[1]) || (!mine && chain.broken === null && head.epoch < seen[0]))) return { ...chain, forked: true };
  if (!seen || head.epoch > seen[0]) storage.set(here, { ...heads, [channelId]: [head.epoch, head.hash] });
  return chain;
}

async function extend(channel: ChatChannelRow, held: Chain | null): Promise<Chain> {
  const { workspaceKey } = store.get();
  const chain: Chain = held ? { ...held, rosters: [...held.rosters] } : { rosters: [], broken: null, forked: false, keysRev: store.get().keysRev };
  // the server answers a page of lists at a time; a long-lived conversation takes several
  for (let page = 0; page < 100 && chain.broken === null && chain.rosters.length < channel.epoch; page++) {
    const { epochs } = await http.get<{ epochs: Row[] }>(`/chat/channels/${channel.id}/epochs?from=${chain.rosters.length + 1}`);
    if (!epochs.length) break;
    for (const row of epochs) {
      if (chain.broken !== null) break;
      try {
        if (row.epoch !== chain.rosters.length + 1) throw new Error('An epoch is missing.');
        chain.rosters.push(await checkRoster(row.roster, { workspaceKey, channelId: channel.id, epoch: row.epoch, wrappedKeys: row.wrappedKeys, proofs: row.proofs }, chain.rosters));
      } catch {
        chain.broken = row.epoch;
      }
    }
  }
  if (chain.broken === null && chain.rosters.length < channel.epoch) chain.broken = chain.rosters.length + 1;
  return remember(channel.id, chain);
}

// Every epoch's member list of a conversation, checked one after the other from the first.
// Checked lists are kept for the tab; a new epoch fetches only what's new. A chain that broke
// is checked again from the start once this person confirms a key, since that may be what it
// was waiting on.
const chatRosters = {
  load(channel: ChatChannelRow): Promise<Chain> {
    const cached = chains.get(channel.id);
    const run = (async () => {
      const held = cached ? await cached.catch(() => null) : null;
      const stale = held && held.broken !== null && held.keysRev !== store.get().keysRev;
      if (held && !stale && (held.rosters.length >= channel.epoch || held.broken !== null)) return held;
      return extend(channel, stale ? null : held);
    })();
    chains.set(channel.id, run);
    run.catch(() => chains.delete(channel.id));
    return run;
  },

  // A list this tab just signed and the server took, so it needn't be fetched to be known.
  async add(channel: ChatChannelRow, roster: ChatRoster) {
    const held = await (chains.get(channel.id) ?? Promise.resolve(null)).catch(() => null);
    if (!held || held.broken !== null || held.rosters.length !== roster.epoch - 1) return chains.delete(channel.id);
    chains.set(channel.id, Promise.resolve(remember(channel.id, { ...held, rosters: [...held.rosters, roster] })));
  },

  at: (chain: Chain, epoch: number) => (chain.broken !== null && epoch >= chain.broken ? null : (chain.rosters[epoch - 1] ?? null)),
  forget: (channelId: string) => chains.delete(channelId),
  clear: () => chains.clear(),
};

export default chatRosters;
