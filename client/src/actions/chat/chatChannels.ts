import http from '../../api/http';
import ApiError from '../../api/ApiError';
import store from '../../state/store';
import chatState from '../../state/chatState';
import chatKeyring from '../../state/chatKeyring';
import b64u from '../../lib/crypto/b64u';
import isAdmin from '../../lib/isAdmin';
import confirmKeys from '../confirmKeys';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import chatMeta, { type Meta } from './chatMeta';
import chatMaintain from './chatMaintain';
import startEpoch from './startEpoch';
import openChannel from './openChannel';
import departures from './departures';
import chatIndex from './chatIndex';
import type ChatChannel from '../../types/ChatChannel';
import type ChatChannelRow from '../../types/ChatChannelRow';

type Kind = ChatChannelRow['kind'];

// Everyone who can be in a conversation: active people on the team, never guests or agents.
const teammates = () => Object.values(store.get().users).filter((u) => !u.deactivated && u.kind === 'human' && u.role !== 'guest').map((u) => u.id);

const unindexed = new Set<string>();

function put(channel: ChatChannel) {
  // a forward-secret conversation's old keys, and what they opened, go from this tab as well
  if (channel.purgedEpoch) {
    chatKeyring.forgetUpTo(channel.id, channel.purgedEpoch);
    for (const [key, tl] of Object.entries(chatState.get().timelines)) {
      if (tl.items.some((m) => m.channelId === channel.id && m.seq && m.epoch <= channel.purgedEpoch)) chatState.putTimeline(key, { items: tl.items.filter((m) => m.channelId !== channel.id || !m.seq || m.epoch > channel.purgedEpoch) });
    }
  }
  // a conversation that turned forward-secret leaves this device's search index
  if (channel.forwardDays && !unindexed.has(channel.id)) {
    unindexed.add(channel.id);
    void chatIndex.forget(channel.id);
  }
  chatState.set((s) => ({ channels: { ...s.channels, [channel.id]: channel } }));
  return channel;
}

async function keyNow(channel: ChatChannel) {
  const key = await chatKeys.get(channel, await chatRosters.load(channel), channel.epoch);
  if (!key) throw new Error('You don’t hold this conversation’s key yet.');
  return key;
}

// The conversations this person is in, and everything that changes one as a whole.
const chatChannels = {
  teammates,

  // whether this person may rename it, change its settings and take people out
  manages(channel: ChatChannelRow) {
    const me = store.get().me;
    return channel.kind === 'group' || (channel.kind === 'channel' && (channel.createdBy === me?.id || isAdmin(me)));
  },

  async load() {
    try {
      const { channels } = await http.get<{ channels: ChatChannelRow[] }>('/chat');
      const opened = await Promise.all(channels.map(openChannel));
      chatState.set({ channels: Object.fromEntries(opened.map((c) => [c.id, c])), loaded: true, error: null });
    } catch (err) {
      chatState.set({ loaded: true, error: err instanceof Error ? err.message : 'Couldn’t load your conversations.' });
    }
  },

  async refresh(id: string) {
    try {
      const { channel } = await http.get<{ channel: ChatChannelRow }>(`/chat/channels/${id}`);
      return put(await openChannel(channel));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) chatChannels.drop(id);
      return null;
    }
  },

  drop(id: string) {
    chatKeyring.forget(id);
    void chatIndex.forget(id);
    chatRosters.forget(id);
    chatState.set((s) => {
      const { [id]: gone, ...channels } = s.channels;
      return { channels };
    });
  },

  // Starts a conversation. A team channel is sealed to every teammate whose key this person has
  // confirmed, and the others get it once someone has; anything else asks first to check the
  // keys of whoever it's for. A direct message that already exists opens instead.
  async create({ kind, audience = 'people', people = [], meta, disappearSeconds = null }: { kind: Kind; audience?: 'team' | 'people'; people?: string[]; meta?: Partial<Meta>; disappearSeconds?: number | null }) {
    const me = store.get().me!.id;
    const members = audience === 'team' ? teammates() : [...new Set([me, ...people])].sort();
    if (audience === 'people') await confirmKeys.ask(members.filter((id) => id !== me), 'this conversation');
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const users = store.get().users;
    const managers = kind === 'channel' ? members.filter((u) => u === me || isAdmin(users[u])) : members;
    const made = await startEpoch({ id, kind, audience }, 1, null, { members, managers });
    // the name, topic and how long messages stay are signed together from the start
    const metaCt = meta?.name || meta?.topic || disappearSeconds ? await chatMeta.seal(made.key, id, 1, { ...meta, disappear: disappearSeconds }) : null;
    const res = await http.post<{ channel: ChatChannelRow; existing?: boolean }>('/chat/channels', { id, kind, audience, members, roster: made.raw, grants: made.grants, metaCt, disappearSeconds });
    if (!res.existing) chatKeyring.put(id, 1, made.key);
    const opened = await openChannel(res.channel);
    // a conversation the server says already exists can't hold anyone but these people
    if (res.existing && !(opened.signedMembers ?? ['']).every((m) => members.includes(m))) throw new Error('The server answered with a conversation whose signed member list isn’t the people you picked. Nothing was sent.');
    return put(opened);
  },

  // The name, topic and settings are signed together; a change to any reseals the lot under the
  // current key, and the server's copy of the settings goes in the same request.
  async rename(channel: ChatChannel, meta: Partial<Meta>) {
    const settings = { disappear: channel.disappearSeconds, forward: channel.forwardDays };
    const next = { name: channel.name, topic: channel.topic, ...settings, ...meta };
    const metaCt = await chatMeta.seal(await keyNow(channel), channel.id, channel.epoch, next);
    const res = await http.patch<{ channel: ChatChannelRow }>(`/chat/channels/${channel.id}`, { metaCt, metaEpoch: channel.epoch, disappearSeconds: next.disappear, forwardDays: next.forward });
    return put(await openChannel(res.channel));
  },

  disappear: (channel: ChatChannel, seconds: number | null) => chatChannels.rename(channel, { disappear: seconds }),

  async notify(channel: ChatChannel, notify: ChatChannel['notify']) {
    await http.put(`/chat/channels/${channel.id}/notify`, { notify });
    put({ ...channel, notify });
  },

  // Adding people, or giving the key to someone waiting for it, asks to check their keys first;
  // taking someone out starts a new key without them.
  async setMembers(channel: ChatChannel, members: string[]) {
    const adding = members.filter((id) => !channel.keyHolders.includes(id));
    if (adding.length) await confirmKeys.ask(adding, 'this conversation');
    await chatMaintain(channel, { members: [...new Set(members)].sort() });
    return chatChannels.refresh(channel.id);
  },

  // Leaving signs a statement here, so any member left can start the next key without you.
  async leave(channel: ChatChannel) {
    await departures.leave(channel.id);
    chatChannels.drop(channel.id);
  },

  forward: (channel: ChatChannel, days: number | null) => chatChannels.rename(channel, { forward: days }),

  // An admin's signed word that these people, out of the team now, are out of every conversation.
  async signRemovals(userIds: string[]) {
    for (const userId of userIds) await departures.remove(userId);
    await chatChannels.load();
  },

  async remove(channel: ChatChannel) {
    await http.del(`/chat/channels/${channel.id}`);
    chatChannels.drop(channel.id);
  },

  // Brings the key up to date when a teammate's browser should (see chatMaintain); quiet when
  // it can't, since another member's browser will.
  async tend(channel: ChatChannel) {
    try {
      if (!(await chatMaintain(channel))) return;
      const fresh = await chatChannels.refresh(channel.id);
      // a forward-secret conversation's old keys go, so whoever manages it moves the name along
      if (fresh?.forwardDays && fresh.metaState === 'ok' && fresh.metaEpoch !== fresh.epoch && chatChannels.manages(fresh)) await chatChannels.rename(fresh, {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await chatChannels.refresh(channel.id);
    }
  },
};

export default chatChannels;
