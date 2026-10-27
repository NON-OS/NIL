import rosterLead from './rosterLead.js';

const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

// Whether `next`, signed by `next.by`, may follow `prev` (null for a conversation's first list):
// the rule every member's browser checks (chatRosterRule in the web app), here so the server
// takes no list they'd refuse. `linked` says `next` names `prev`'s hash, or none for a first list;
// `proven` is who has a signed departure on file that the list cites. formal/Nil/ChatRoster.lean
// is the model both follow, with proofs of what it allows.
export default function rosterRule(next, prev, linked, proven) {
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
