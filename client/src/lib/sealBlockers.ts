export type Blocker = 'history' | 'settings' | 'unconfirmed' | 'holdsOut';

// The first reason a browser may not seal anything under a conversation's current key, or null:
// the server showing an older epoch than this browser checked (`seen`) or another history; its
// settings not the signed ones; someone holding the key whose key this browser hasn't confirmed;
// or someone holding it whom the server has as out. formal/Nil/ChatSeal.lean is the model, with
// proofs that sealing goes ahead exactly when none of these holds.
export default function sealBlockers(g: { me: string; holders: string[]; confirmed: string[]; members: string[]; epoch: number; seen: number; forked: boolean; settingsOk: boolean }): Blocker | null {
  if (g.forked || g.epoch < g.seen) return 'history';
  if (!g.settingsOk) return 'settings';
  if (g.holders.some((h) => h !== g.me && !g.confirmed.includes(h))) return 'unconfirmed';
  if (g.holders.some((h) => !g.members.includes(h))) return 'holdsOut';
  return null;
}
