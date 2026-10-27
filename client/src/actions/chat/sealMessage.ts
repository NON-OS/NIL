import store from '../../state/store';
import keyring from '../../state/keyring';
import chatText from '../../lib/crypto/chatText';
import chatFacts, { type ChatFacts } from '../../lib/crypto/chatFacts';
import signedFacts from '../../lib/crypto/signedFacts';
import keyHash from '../../lib/crypto/keyHash';
import chatContent, { type Content } from '../../lib/chatContent';

export interface Sealing {
  id: string;
  channelId: string;
  epoch: number;
  sentAt: number;
  key: Uint8Array;
  facts: Omit<ChatFacts, 'key' | 'at'>;
  content: Partial<Content>;
}

// Signs a message, reaction, edit or deletion as this person, for exactly this place, and
// encrypts it under the epoch's key with the same place as the additional data.
export default async function sealMessage(m: Sealing) {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock your keys first.');
  const me = store.get().me!.id;
  const at = { workspaceKey: store.get().workspaceKey, channelId: m.channelId, epoch: m.epoch, message: { id: m.id, senderId: me, sentAt: m.sentAt } };
  const facts = chatFacts.list({ ...m.facts, at: Date.now(), key: keyHash(m.key) });
  const json = signedFacts.seal(chatContent.write(m.content), { kind: chatFacts.kind, place: chatFacts.place(at), facts, by: me, signingPrivate: id.signingPrivate });
  return chatText.seal(m.key, at, json);
}
