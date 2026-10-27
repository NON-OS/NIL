import store from '../../state/store';
import keyring from '../../state/keyring';
import chatText from '../../lib/crypto/chatText';
import chatMetaFacts from '../../lib/crypto/chatMetaFacts';
import signedFacts from '../../lib/crypto/signedFacts';
import keyHash from '../../lib/crypto/keyHash';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters, { type Chain } from './chatRosters';
import type ChatChannel from '../../types/ChatChannel';
import type ChatChannelRow from '../../types/ChatChannelRow';

export interface Meta {
  name: string;
  topic: string;
}

const clean = (text: unknown, max: number) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const at = (channelId: string, epoch: number) => ({ workspaceKey: store.get().workspaceKey, channelId, epoch, message: null });

// A conversation's name and topic: signed by whoever set them, for this conversation and epoch,
// and sealed under that epoch's key. They count only when the signer manages the conversation
// in that epoch's checked member list.
const chatMeta = {
  limits: { name: 80, topic: 500 },
  clean: (m: Meta): Meta => ({ name: clean(m.name, chatMeta.limits.name), topic: clean(m.topic, chatMeta.limits.topic) }),

  async seal(key: Uint8Array, channelId: string, epoch: number, meta: Meta) {
    const id = keyring.identity();
    if (!id) throw new Error('Unlock your keys first.');
    const facts = chatMetaFacts.list({ at: Date.now(), key: keyHash(key) });
    const json = signedFacts.seal(JSON.stringify(chatMeta.clean(meta)), { kind: chatMetaFacts.kind, place: chatMetaFacts.place(store.get().workspaceKey, channelId, epoch), facts, by: store.get().me!.id, signingPrivate: id.signingPrivate });
    return chatText.seal(key, at(channelId, epoch), json);
  },

  async open(channel: ChatChannelRow, chain: Chain): Promise<Pick<ChatChannel, 'name' | 'topic' | 'metaState'>> {
    if (!channel.metaCt || !channel.metaEpoch) return { name: '', topic: '', metaState: 'none' };
    const epoch = channel.metaEpoch;
    let key: Uint8Array | null;
    try {
      key = await chatKeys.get(channel, chain, epoch);
    } catch {
      return { name: '', topic: '', metaState: 'unverified' };
    }
    if (!key) return { name: '', topic: '', metaState: chatRosters.at(chain, epoch) || chain.broken === null ? 'locked' : 'unverified' };
    try {
      const { signed, facts } = signedFacts.open(await chatText.open(key, at(channel.id, epoch), channel.metaCt));
      const f = chatMetaFacts.parse(facts ?? []);
      const roster = chatRosters.at(chain, epoch);
      const statement = { kind: chatMetaFacts.kind, place: chatMetaFacts.place(store.get().workspaceKey, channel.id, epoch), facts: chatMetaFacts.list(f) };
      const fits = roster?.managers.includes(signed.by) && f.key === keyHash(key);
      if (!fits || !(await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k)))) throw new Error('unverified');
      const meta = chatMeta.clean(JSON.parse(signed.text));
      return { ...meta, metaState: 'ok' };
    } catch {
      return { name: '', topic: '', metaState: 'unverified' };
    }
  },
};

export default chatMeta;
