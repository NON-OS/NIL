import http from '../../api/http';
import store from '../../state/store';
import keyring from '../../state/keyring';
import signedFacts from '../../lib/crypto/signedFacts';
import chatDeparture, { type DepartureKind } from '../../lib/crypto/chatDeparture';
import keyDirectory from '../keyDirectory';

function sign(kind: DepartureKind, channelId: string, userId: string) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  const { workspaceKey, me } = store.get();
  const place = chatDeparture.place(kind, workspaceKey, channelId, userId);
  return signedFacts.seal(chatDeparture.text(kind, userId), { kind: chatDeparture.kinds[kind], place, facts: chatDeparture.list(Date.now()), by: me!.id, signingPrivate: id.signingPrivate });
}

// Leaving a conversation, and taking someone out of the team, each with a statement signed here.
const departures = {
  leave: (channelId: string) => http.post(`/chat/channels/${channelId}/leave`, { statement: sign('leave', channelId, store.get().me!.id) }),

  // after an admin deactivates someone or makes them a guest, from that same browser
  remove: (userId: string) => http.post('/chat/removals', { userId, statement: sign('removal', '', userId) }),

  // Who a statement says is out and when, once its signature checks out against a key this person
  // can see for its signer; null when it doesn't. A leaving has to be signed by whoever left.
  async check(raw: string, channelId: string, userId: string): Promise<{ kind: DepartureKind; by: string; at: number } | null> {
    try {
      const { signed, facts } = signedFacts.open(raw);
      const { at } = chatDeparture.parse(facts ?? []);
      const { workspaceKey } = store.get();
      for (const kind of ['leave', 'removal'] as const) {
        if (signed.text !== chatDeparture.text(kind, userId) || (kind === 'leave' && signed.by !== userId)) continue;
        const statement = { kind: chatDeparture.kinds[kind], place: chatDeparture.place(kind, workspaceKey, channelId, userId), facts: chatDeparture.list(at) };
        if (await keyDirectory.author(signed.by, at, (k) => signedFacts.verify(signed, statement, k), { former: true })) return { kind, by: signed.by, at };
      }
    } catch {}
    return null;
  },
};

export default departures;
