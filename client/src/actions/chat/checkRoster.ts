import signedFacts from '../../lib/crypto/signedFacts';
import chatRoster from '../../lib/crypto/chatRoster';
import keyDirectory from '../keyDirectory';
import type ChatRoster from '../../types/ChatRoster';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// Whether `by` was allowed to start this epoch with this list, given the checked list before
// it. The first list's signer has to manage what they made: a channel's creator, or anyone in a
// group or a direct message. After that, a manager may change anything but the kind of
// conversation. Anyone else in it may only start a new key for the same people, or bring
// people into a team channel; they can never take anyone out or change who manages it.
function allowed(prev: ChatRoster | null, next: ChatRoster) {
  if (!next.members.includes(next.by)) return false;
  if (next.kind === 'dm' && next.members.length !== 2) return false;
  if (next.kind !== 'channel' && !same(next.managers, next.members)) return false;
  if (!prev) return next.prev === null && next.managers.includes(next.by);
  if (next.prev !== prev.hash || next.kind !== prev.kind || next.audience !== prev.audience) return false;
  if (next.kind === 'dm' && !same(next.members, prev.members)) return false;
  if (prev.managers.includes(next.by)) return true;
  if (!prev.members.includes(next.by) || !same(next.managers, prev.managers)) return false;
  const keepsEveryone = prev.members.every((id) => next.members.includes(id));
  return keepsEveryone && (same(next.members, prev.members) || next.audience === 'team');
}

// Opens one epoch's signed member list and checks it against the one before: its signature
// against a key this person can see for the signer, its place in the conversation, and that
// the signer was allowed to start it. Throws when anything doesn't hold.
export default async function checkRoster(raw: string, at: { workspaceKey: string; channelId: string; epoch: number; wrappedKey: string | null }, prev: ChatRoster | null): Promise<ChatRoster> {
  const { signed, facts } = signedFacts.open(raw);
  if (!facts || signed.text !== '') throw new Error('This member list isn’t signed the way Nil signs one.');
  const f = chatRoster.parse(facts);
  const statement = { kind: chatRoster.kind, place: chatRoster.place(at.workspaceKey, at.channelId, at.epoch), facts: chatRoster.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw new Error('Nil can’t confirm who started this key.');
  const roster: ChatRoster = { ...f, epoch: at.epoch, by: signed.by, hash: chatRoster.hash(raw), wrappedKey: at.wrappedKey };
  if (!allowed(prev, roster)) throw new Error('Someone who wasn’t allowed to changed who is in this conversation.');
  return roster;
}
