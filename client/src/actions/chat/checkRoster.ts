import store from '../../state/store';
import signedFacts from '../../lib/crypto/signedFacts';
import chatRoster from '../../lib/crypto/chatRoster';
import isAdmin from '../../lib/isAdmin';
import keyDirectory from '../keyDirectory';
import departures from './departures';
import type ChatRoster from '../../types/ChatRoster';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

// When someone joined for the last time: the time of the earliest list in the unbroken run of
// lists, up to `prev`, that names them. A departure signed before that is from an earlier stay.
function joinedAt(history: ChatRoster[], userId: string) {
  let at = 0;
  for (let i = history.length - 1; i >= 0 && history[i].members.includes(userId); i--) at = history[i].at;
  return at;
}

// Whether each person left out has a signed departure that counts: their own leaving of this
// conversation, or a removal from the team signed by someone who manages it, or by an admin whose
// key this person confirmed (the server says who is an admin, so an account it made up can't be
// one here). Either has to be signed since they last joined.
async function proven(dropped: string[], proofs: string[], channelId: string, prev: ChatRoster, history: ChatRoster[]) {
  const users = store.get().users;
  const keys = await keyDirectory.load();
  const me = store.get().me?.id;
  const vouched = (id: string) => isAdmin(users[id]) && !users[id]?.deactivated && (id === me || keys.get(id)?.state === 'confirmed');
  for (const userId of dropped) {
    let ok = false;
    for (const raw of proofs) {
      const d = await departures.check(raw, channelId, userId);
      const signer = d && (d.kind === 'leave' || prev.managers.includes(d.by) || vouched(d.by));
      if (signer && d.at >= joinedAt(history, userId)) ok = true;
      if (ok) break;
    }
    if (!ok) return false;
  }
  return true;
}

// Whether `by` was allowed to start this epoch with this list, given the checked lists before it.
// The first list's signer has to manage what they made: a channel's creator, or anyone in a group
// or a direct message. After that, a manager may change anything but the kind of conversation.
// Anyone else in it may start a new key for the same people, bring people into a team channel,
// and leave out people whose signed departure it cites; nothing else.
async function allowed(next: ChatRoster, history: ChatRoster[], proofs: string[], channelId: string) {
  const prev = history[history.length - 1] ?? null;
  if (!next.members.includes(next.by)) return false;
  if (next.kind === 'dm' && next.members.length !== 2) return false;
  // a list can't claim to be older than the one it follows, which would revive old departures
  if (prev && next.at <= prev.at) return false;
  if (next.kind !== 'channel' && !same(next.managers, next.members)) return false;
  if (!prev) return next.prev === null && next.managers.includes(next.by);
  if (next.prev !== prev.hash || next.kind !== prev.kind || next.audience !== prev.audience) return false;
  if (next.kind === 'dm' && !same(next.members, prev.members)) return false;
  if (prev.managers.includes(next.by)) return true;
  if (!prev.members.includes(next.by)) return false;
  const dropped = prev.members.filter((id) => !next.members.includes(id));
  if (!same(next.managers, prev.managers.filter((id) => !dropped.includes(id)))) return false;
  const added = next.members.some((id) => !prev.members.includes(id));
  if (added && next.audience !== 'team') return false;
  return proven(dropped, proofs, channelId, prev, history);
}

// Opens one epoch's signed member list and checks it against the lists before: its signature
// against a key this person can see for the signer, its place in the conversation, and that the
// signer was allowed to start it. Throws when anything doesn't hold.
export default async function checkRoster(
  raw: string,
  at: { workspaceKey: string; channelId: string; epoch: number; wrappedKeys: string[]; proofs?: string[] },
  history: ChatRoster[],
): Promise<ChatRoster> {
  const { signed, facts } = signedFacts.open(raw);
  if (!facts || signed.text !== '') throw new Error('This member list isn’t signed the way Nil signs one.');
  const f = chatRoster.parse(facts);
  const statement = { kind: chatRoster.kind, place: chatRoster.place(at.workspaceKey, at.channelId, at.epoch), facts: chatRoster.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw new Error('Nil can’t confirm who started this key.');
  const prev = history[history.length - 1];
  const roster: ChatRoster = { ...f, epoch: at.epoch, by: signed.by, hash: chatRoster.hash(raw), wrappedKeys: at.wrappedKeys, departed: [] };
  if (!(await allowed(roster, history, at.proofs ?? [], at.channelId))) throw new Error('Someone who wasn’t allowed to changed who is in this conversation.');
  // who went on the strength of their own or an admin's signed word, rather than being taken out
  if (prev) for (const id of prev.members.filter((m) => !f.members.includes(m))) if (await proven([id], at.proofs ?? [], at.channelId, prev, history)) roster.departed.push(id);
  return roster;
}
