import store from '../../state/store';
import signedFacts from '../../lib/crypto/signedFacts';
import chatRoster from '../../lib/crypto/chatRoster';
import isAdmin from '../../lib/isAdmin';
import keyDirectory from '../keyDirectory';
import departures from './departures';
import chatRosterRule from '../../lib/chatRosterRule';
import type ChatRoster from '../../types/ChatRoster';

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
async function provenOne(userId: string, proofs: string[], channelId: string, prev: ChatRoster, history: ChatRoster[]) {
  const users = store.get().users;
  const keys = await keyDirectory.load();
  const me = store.get().me?.id;
  const vouched = (id: string) => isAdmin(users[id]) && !users[id]?.deactivated && (id === me || keys.get(id)?.state === 'confirmed');
  for (const raw of proofs) {
    const d = await departures.check(raw, channelId, userId);
    const signer = d && (d.kind === 'leave' || prev.managers.includes(d.by) || vouched(d.by));
    if (signer && d.at >= joinedAt(history, userId)) return true;
  }
  return false;
}

// Whether `by` was allowed to start this epoch with this list, given the checked lists before it:
// chatRosterRule, with the departures proven for whoever the list leaves out.
async function allowed(next: ChatRoster, history: ChatRoster[], proofs: string[], channelId: string) {
  const prev = history[history.length - 1] ?? null;
  const linked = prev ? next.prev === prev.hash : next.prev === null;
  const proven = [];
  if (prev) for (const id of prev.members.filter((m) => !next.members.includes(m))) if (await provenOne(id, proofs, channelId, prev, history)) proven.push(id);
  return chatRosterRule(next, prev, linked, proven);
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
  if (prev) for (const id of prev.members.filter((m) => !f.members.includes(m))) if (await provenOne(id, at.proofs ?? [], at.channelId, prev, history)) roster.departed.push(id);
  return roster;
}
