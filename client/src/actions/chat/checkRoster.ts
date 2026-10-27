import signedFacts from '../../lib/crypto/signedFacts';
import chatRoster from '../../lib/crypto/chatRoster';
import keyDirectory from '../keyDirectory';
import departureCounts from './departureCounts';
import chatRosterRule from '../../lib/chatRosterRule';
import type ChatRoster from '../../types/ChatRoster';

// how far ahead of this clock a list may be dated: twice the clock difference the server allows
const AHEAD_MS = 20 * 60_000;

// Whether `by` was allowed to start this epoch with this list, given the checked lists before it:
// chatRosterRule, with the departures proven for whoever the list leaves out.
async function allowed(next: ChatRoster, history: ChatRoster[], proofs: string[], channelId: string) {
  const prev = history[history.length - 1] ?? null;
  const linked = prev ? next.prev === prev.hash : next.prev === null;
  const proven = [];
  if (prev) for (const id of prev.members.filter((m) => !next.members.includes(m))) if (await departureCounts(proofs, channelId, id, history)) proven.push(id);
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
  // dated ahead of every clock that matters, it would hold off whoever signs the next one
  if (f.at > Date.now() + AHEAD_MS) throw new Error('This member list is dated in the future.');
  const statement = { kind: chatRoster.kind, place: chatRoster.place(at.workspaceKey, at.channelId, at.epoch), facts: chatRoster.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw new Error('Nil can’t confirm who started this key.');
  const prev = history[history.length - 1];
  const roster: ChatRoster = { ...f, epoch: at.epoch, by: signed.by, hash: chatRoster.hash(raw), wrappedKeys: at.wrappedKeys, departed: [] };
  if (!(await allowed(roster, history, at.proofs ?? [], at.channelId))) throw new Error('Someone who wasn’t allowed to changed who is in this conversation.');
  // who went on the strength of their own or an admin's signed word, rather than being taken out
  if (prev) for (const id of prev.members.filter((m) => !f.members.includes(m))) if (await departureCounts(at.proofs ?? [], at.channelId, id, history)) roster.departed.push(id);
  return roster;
}
