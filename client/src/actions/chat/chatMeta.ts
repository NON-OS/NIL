import store from '../../state/store';
import keyring from '../../state/keyring';
import chatText from '../../lib/crypto/chatText';
import chatMetaFacts from '../../lib/crypto/chatMetaFacts';
import signedFacts from '../../lib/crypto/signedFacts';
import keyHash from '../../lib/crypto/keyHash';
import stripBidi from '../../lib/stripBidi';
import rosterLead from '../../lib/rosterLead';
import metaHistory from '../../state/metaHistory';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters, { type Chain } from './chatRosters';
import type ChatChannel from '../../types/ChatChannel';
import type ChatChannelRow from '../../types/ChatChannelRow';

export interface Meta {
  name: string;
  topic: string;
  // how long messages stay, in seconds, and how long old keys are kept, in days; null for never
  disappear: number | null;
  forward: number | null;
}

const setting = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);

// text that turns round which way it reads could make a name pass for another, so it goes too
const clean = (text: unknown, max: number) => stripBidi(String(text ?? '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// how far apart the signer's clock and the one that started the next key may be
const SKEW_MS = 20 * 60_000;
const at = (channelId: string, epoch: number) => ({ workspaceKey: store.get().workspaceKey, channelId, epoch, message: null });

// A conversation's name and topic, and its disappearing and forward-secrecy settings: signed by
// whoever set them, for this conversation and epoch, and sealed under that epoch's key. They count
// only when the signer manages the conversation in that epoch's checked member list. The server
// keeps its own copy of the settings to act on; a browser compares the two before it sends.
const chatMeta = {
  limits: { name: 80, topic: 500 },
  clean: (m: Partial<Meta>): Meta => ({ name: clean(m.name, chatMeta.limits.name), topic: clean(m.topic, chatMeta.limits.topic), disappear: setting(m.disappear), forward: setting(m.forward) }),

  async seal(key: Uint8Array, channelId: string, epoch: number, meta: Partial<Meta>) {
    const id = keyring.identity();
    if (!id) throw new Error('Unlock your keys first.');
    const facts = chatMetaFacts.list({ at: Date.now(), key: keyHash(key) });
    const json = signedFacts.seal(JSON.stringify(chatMeta.clean(meta)), { kind: chatMetaFacts.kind, place: chatMetaFacts.place(store.get().workspaceKey, channelId, epoch), facts, by: store.get().me!.id, signingPrivate: id.signingPrivate });
    return chatText.seal(key, at(channelId, epoch), json);
  },

  async open(channel: ChatChannelRow, chain: Chain): Promise<Pick<ChatChannel, 'name' | 'topic' | 'metaState' | 'signedSettings'>> {
    if (!channel.metaCt || !channel.metaEpoch) return { name: '', topic: '', metaState: metaHistory.stale(channel.id, null, null) ? 'unverified' : 'none', signedSettings: null };
    const epoch = channel.metaEpoch;
    let key: Uint8Array | null;
    try {
      key = await chatKeys.get(channel, chain, epoch);
    } catch {
      return { name: '', topic: '', metaState: 'unverified', signedSettings: null };
    }
    if (!key) return { name: '', topic: '', metaState: chatRosters.at(chain, epoch) || chain.broken === null ? 'locked' : 'unverified', signedSettings: null };
    try {
      const { signed, facts } = signedFacts.open(await chatText.open(key, at(channel.id, epoch), channel.metaCt));
      const f = chatMetaFacts.parse(facts ?? []);
      const roster = chatRosters.at(chain, epoch);
      const statement = { kind: chatMetaFacts.kind, place: chatMetaFacts.place(store.get().workspaceKey, channel.id, epoch), facts: chatMetaFacts.list(f) };
      // signed while its epoch was the newest, so a manager taken out can't sign one under an
      // old key they kept, and never older than one this browser already opened
      const next = chatRosters.at(chain, epoch + 1);
      const current = (!next || f.at <= next.at + SKEW_MS) && f.at <= Date.now() + SKEW_MS;
      const fits = roster && rosterLead(roster).includes(signed.by) && f.key === keyHash(key) && current && !metaHistory.stale(channel.id, epoch, f.at);
      if (!fits || !(await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k), { former: true }))) throw new Error('unverified');
      const meta = chatMeta.clean(JSON.parse(signed.text));
      metaHistory.record(channel.id, epoch, f.at);
      return { name: meta.name, topic: meta.topic, metaState: 'ok', signedSettings: { disappear: meta.disappear, forward: meta.forward } };
    } catch {
      return { name: '', topic: '', metaState: 'unverified', signedSettings: null };
    }
  },
};

export default chatMeta;
