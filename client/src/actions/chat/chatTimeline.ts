import http from '../../api/http';
import chatState from '../../state/chatState';
import chatRosters from './chatRosters';
import openMessage from './openMessage';
import chatStreams from './chatStreams';
import type ChatItem from '../../types/ChatItem';
import type ChatChannelRow from '../../types/ChatChannelRow';
import type ChatMessageRow from '../../types/ChatMessageRow';

const keyOf = (channelId: string, threadId: string | null = null) => (threadId ? `thread:${threadId}` : channelId);
const order = (a: ChatItem, b: ChatItem) => (a.seq || Number.MAX_SAFE_INTEGER) - (b.seq || Number.MAX_SAFE_INTEGER) || a.sentAt - b.sentAt;

// Puts items into a timeline: one per id, in the server's order, those still waiting to be
// sent at the end. Then looks again at every sender's numbering for what the server dropped,
// sent twice or reordered.
function merge(channelId: string, threadId: string | null, incoming: ChatItem[], patch: { more?: boolean } = {}) {
  const key = keyOf(channelId, threadId);
  const held = chatState.timeline(key);
  const byId = new Map(held.items.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  const items = [...byId.values()].sort(order);
  chatState.putTimeline(key, { items, ...patch });
  if (threadId) return;
  const more = patch.more ?? held.more;
  chatState.set((s) => ({ notices: { ...s.notices, [channelId]: chatStreams(items, { fromStart: !more }) } }));
}

async function open(channel: ChatChannelRow, rows: ChatMessageRow[]) {
  const chain = await chatRosters.load(channel);
  return Promise.all(rows.map((row) => openMessage(row, channel, chain)));
}

// A conversation's messages as this tab has them: the newest page first, older pages as the
// list scrolls up, and live messages as they arrive. A thread is a timeline of its own.
const chatTimeline = {
  keyOf,

  async latest(channel: ChatChannelRow, threadId: string | null = null) {
    const key = keyOf(channel.id, threadId);
    chatState.putTimeline(key, { loading: true, error: null });
    try {
      const res = await http.get<{ messages: ChatMessageRow[]; more: boolean }>(`/chat/channels/${channel.id}/messages${threadId ? `?thread=${threadId}` : ''}`);
      merge(channel.id, threadId, await open(channel, res.messages), { more: res.more });
    } catch (err) {
      chatState.putTimeline(key, { error: err instanceof Error ? err.message : 'Couldn’t load messages.' });
    } finally {
      chatState.putTimeline(key, { loading: false });
    }
  },

  async older(channel: ChatChannelRow, threadId: string | null = null) {
    const key = keyOf(channel.id, threadId);
    const held = chatState.timeline(key);
    const first = held.items.find((m) => m.seq);
    if (held.loading || !held.more || !first) return;
    chatState.putTimeline(key, { loading: true, error: null });
    try {
      const thread = threadId ? `&thread=${threadId}` : '';
      const res = await http.get<{ messages: ChatMessageRow[]; more: boolean }>(`/chat/channels/${channel.id}/messages?before=${first.seq}${thread}`);
      merge(channel.id, threadId, await open(channel, res.messages), { more: res.more });
    } catch (err) {
      chatState.putTimeline(key, { error: err instanceof Error ? err.message : 'Couldn’t load older messages.' });
    } finally {
      chatState.putTimeline(key, { loading: false });
    }
  },

  // A message from the server (live, or the answer to a send) into every timeline this tab has
  // loaded; one not opened yet starts from the server's newest page when it is.
  async arrive(channel: ChatChannelRow, row: ChatMessageRow, root?: ChatMessageRow) {
    const held = chatState.get().timelines;
    if (!held[channel.id] && !(row.threadId && held[keyOf(channel.id, row.threadId)])) return null;
    const [item, top] = await open(channel, root ? [row, root] : [row]);
    if (row.threadId) {
      if (chatState.get().timelines[keyOf(channel.id, row.threadId)]) merge(channel.id, row.threadId, [item]);
      if (top && chatState.get().timelines[channel.id]) merge(channel.id, null, [top]);
    } else if (chatState.get().timelines[channel.id]) merge(channel.id, null, [item]);
    return item;
  },

  // Shows a message this tab is still sending, or replaces it with what the server kept.
  local: (item: ChatItem) => merge(item.channelId, item.threadId, [item]),
  drop(channelId: string, threadId: string | null, id: string) {
    const key = keyOf(channelId, threadId);
    chatState.putTimeline(key, { items: chatState.timeline(key).items.filter((m) => m.id !== id) });
  },

  // Opens again whatever was waiting on a key, once one arrives.
  async reopen(channel: ChatChannelRow) {
    for (const [key, tl] of Object.entries(chatState.get().timelines)) {
      if (!(key === channel.id || tl.items.some((m) => m.channelId === channel.id))) continue;
      if (tl.items.some((m) => m.state === 'locked')) await chatTimeline.latest(channel, key === channel.id ? null : key.slice(7));
    }
  },
};

export default chatTimeline;
