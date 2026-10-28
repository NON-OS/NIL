import store from '../../state/store';
import keyring from '../../state/keyring';
import signedFacts from '../../lib/crypto/signedFacts';
import chatRoster, { type RosterFacts } from '../../lib/crypto/chatRoster';
import keyHash from '../../lib/crypto/keyHash';
import chatKeys, { type Grant } from './chatKeys';
import type ChatRoster from '../../types/ChatRoster';

type Shape = { id: string; kind: RosterFacts['kind']; audience: RosterFacts['audience'] };

// Makes the key for a conversation's next epoch, seals it to `members` (those whose keys this
// person confirmed; the others wait), and signs the list of who got it. Nothing is sent: the
// caller posts it with whatever else changes.
export default async function startEpoch(channel: Shape, epoch: number, prev: ChatRoster | null, { members, managers }: { members: string[]; managers: string[] }) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  const me = store.get().me!.id;
  const key = chatKeys.fresh();
  const grants: Grant[] = await chatKeys.seal(key, chatRoster.people([me, ...members]));
  const sealed = chatRoster.people(grants.map((g) => g.userId));
  const facts: RosterFacts = {
    kind: channel.kind,
    audience: channel.audience,
    members: sealed,
    managers: channel.kind === 'channel' ? chatRoster.people(managers).filter((u) => sealed.includes(u)) : sealed,
    key: keyHash(key),
    prev: prev?.hash ?? null,
    // later than the list before, even one dated ahead of this clock, so nobody can hold the next one off
    at: Math.max(Date.now(), (prev?.at ?? 0) + 1),
  };
  const raw = signedFacts.seal('', { kind: chatRoster.kind, place: chatRoster.place(store.get().workspaceKey, channel.id, epoch), facts: chatRoster.list(facts), by: me, signingPrivate: id.signingPrivate });
  const roster: ChatRoster = { ...facts, epoch, by: me, hash: chatRoster.hash(raw), wrappedKeys: [grants[0].wrappedKey], departed: [] };
  return { key, raw, grants, roster };
}
