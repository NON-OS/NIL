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
import type ChatChannel from '../../types/ChatChannel';
import type ChatChannelRow from '../../types/ChatChannelRow';

type Kind = ChatChannelRow['kind'];

// Everyone who can be in a conversation: active people on the team, never guests or agents.
const teammates = () => Object.values(store.get().users).filter((u) => !u.deactivated && u.kind === 'human' && u.role !== 'guest').map((u) => u.id);

function put(channel: ChatChannel) {
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
    chatRosters.forget(id);
    chatState.set((s) => {
      const { [id]: gone, ...channels } = s.channels;
      return { channels };
    });
  },

  // Starts a conversation. A team channel is sealed to every teammate whose key this person has
  // confirmed, and the others get it once someone has; anything else asks first to check the
  // keys of whoever it's for. A direct message that already exists opens instead.
  async create({ kind, audience = 'people', people = [], meta, disappearSeconds = null }: { kind: Kind; audience?: 'team' | 'people'; people?: string[]; meta?: Meta; disappearSeconds?: number | null }) {
    const me = store.get().me!.id;
    const members = audience === 'team' ? teammates() : [...new Set([me, ...people])].sort();
    if (audience === 'people') await confirmKeys.ask(members.filter((id) => id !== me), 'this conversation');
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const users = store.get().users;
    const managers = kind === 'channel' ? members.filter((u) => u === me || isAdmin(users[u])) : members;
    const made = await startEpoch({ id, kind, audience }, 1, null, { members, managers });
    const metaCt = meta && (meta.name || meta.topic) ? await chatMeta.seal(made.key, id, 1, meta) : null;
    const res = await http.post<{ channel: ChatChannelRow; existing?: boolean }>('/chat/channels', { id, kind, audience, members, roster: made.raw, grants: made.grants, metaCt, disappearSeconds });
    if (!res.existing) chatKeyring.put(id, 1, made.key);
    return put(await openChannel(res.channel));
  },

  async rename(channel: ChatChannel, meta: Meta) {
    const metaCt = await chatMeta.seal(await keyNow(channel), channel.id, channel.epoch, meta);
    const res = await http.patch<{ channel: ChatChannelRow }>(`/chat/channels/${channel.id}`, { metaCt, metaEpoch: channel.epoch });
    return put(await openChannel(res.channel));
  },

  async disappear(channel: ChatChannel, seconds: number | null) {
    const res = await http.patch<{ channel: ChatChannelRow }>(`/chat/channels/${channel.id}`, { disappearSeconds: seconds });
    return put(await openChannel(res.channel));
  },

  async notify(channel: ChatChannel, notify: ChatChannel['notify']) {
    await http.put(`/chat/channels/${channel.id}/notify`, { notify });
    put({ ...channel, notify });
  },

  // Adding people asks to check their keys first; taking someone out starts a new key without them.
  async setMembers(channel: ChatChannel, members: string[]) {
    const adding = members.filter((id) => !channel.members.includes(id));
    if (adding.length) await confirmKeys.ask(adding, 'this conversation');
    await chatMaintain(channel, { members: [...new Set(members)].sort() });
    return chatChannels.refresh(channel.id);
  },

  async leave(channel: ChatChannel) {
    await http.post(`/chat/channels/${channel.id}/leave`);
    chatChannels.drop(channel.id);
  },

  async remove(channel: ChatChannel) {
    await http.del(`/chat/channels/${channel.id}`);
    chatChannels.drop(channel.id);
  },

  // Brings the key up to date when a teammate's browser should (see chatMaintain); quiet when
  // it can't, since another member's browser will.
  async tend(channel: ChatChannel) {
    try {
      if (await chatMaintain(channel)) await chatChannels.refresh(channel.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await chatChannels.refresh(channel.id);
    }
  },
};

export default chatChannels;
