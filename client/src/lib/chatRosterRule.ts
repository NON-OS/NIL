import rosterLead from './rosterLead';

// One epoch's signed member list, as the rule needs it.
export interface RuleList {
  kind: 'channel' | 'dm' | 'group';
  audience: 'team' | 'people';
  members: string[];
  managers: string[];
  at: number;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// Whether `by` was allowed to sign `next` after `prev` (null for a conversation's first list),
// with `linked` saying `next` names `prev`'s hash (or, for a first list, names none) and `proven`
// the people whose signed departure counts. The first list's signer has to manage what they made.
// After that, a manager may change anything but the kind of conversation. Anyone else in it may
// start a new key for the same people, bring people into a team channel, and leave out people
// whose departure is proven; nothing else. Lists are sorted. formal/Nil/ChatRoster.lean is the
// model this follows, with proofs of what it allows.
export default function chatRosterRule(next: RuleList & { by: string }, prev: RuleList | null, linked: boolean, proven: string[]) {
  if (!next.members.includes(next.by)) return false;
  if (next.kind === 'dm' && next.members.length !== 2) return false;
  if (next.kind !== 'channel' && !same(next.managers, next.members)) return false;
  if (!linked) return false;
  if (!prev) return next.managers.includes(next.by);
  // a list can't claim to be older than the one it follows, which would revive old departures
  if (next.at <= prev.at || next.kind !== prev.kind || next.audience !== prev.audience) return false;
  if (next.kind === 'dm' && !same(next.members, prev.members)) return false;
  // a conversation whose managers all left is managed by everyone still in it
  if (rosterLead(prev).includes(next.by)) return true;
  if (!prev.members.includes(next.by)) return false;
  const dropped = prev.members.filter((id) => !next.members.includes(id));
  if (!same(next.managers, prev.managers.filter((id) => !dropped.includes(id)))) return false;
  if (next.audience !== 'team' && next.members.some((id) => !prev.members.includes(id))) return false;
  return dropped.every((id) => proven.includes(id));
}
