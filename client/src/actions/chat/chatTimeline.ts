import http from '../../api/http';
import chatState from '../../state/chatState';
import chatRosters from './chatRosters';
import openMessage from './openMessage';
import chatStreams from './chatStreams';
import chatIndex from './chatIndex';
import lateUnderOldKey from '../../lib/lateUnderOldKey';
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
  chatState.putTimeline(key, { items: flag(channelId, [...byId.values()].sort(order)), ...patch });
  recount(channelId, threadId);
}

// Marks a message as not confirmed when the server placed it late under an older key, or showed
// a version older than its sender's mark says they made, or a deleted one as if it weren't.
function flag(channelId: string, sorted: ChatItem[]) {
  const late = lateUnderOldKey(sorted);
  const marks = Object.values(chatState.get().marks[channelId] ?? {});
  const older = (m: ChatItem) =>
    marks.some((k) => {
      const n = k.senderId === m.senderId ? k.edits[m.id] : undefined;
      return n !== undefined && (n === -1 ? m.type !== 'deleted' : m.edit < n);
    });
  return sorted.map((m) => (m.state !== 'unverified' && (late.has(m.id) || older(m)) ? { ...m, state: 'unverified' as const } : m));
}

// Looks again at every sender's numbering in a conversation's main timeline, or one thread's,
// and their marks. A thread's notices are kept under the thread's timeline.
function recount(channelId: string, threadId: string | null = null) {
  const key = keyOf(channelId, threadId);
  const tl = chatState.timeline(key);
  const marks = chatState.get().marks[channelId] ?? {};
  chatState.set((s) => ({ notices: { ...s.notices, [key]: chatStreams(tl.items, { fromStart: !tl.more, marks, scope: threadId ?? 'main' }) } }));
}

async function open(channel: ChatChannelRow, rows: ChatMessageRow[]) {
  const chain = await chatRosters.load(channel);
  const items = await Promise.all(rows.map((row) => openMessage(row, channel, chain)));
  // whatever opens here is searchable later, from this device
  chatIndex.note(items);
  return items;
}

// A conversation's messages as this tab has them: the newest page first, older pages as the
// list scrolls up, and live messages as they arrive. A thread is a timeline of its own.
const chatTimeline = {
  keyOf,
  // the main timeline and every thread this tab has loaded, after the marks changed
  recount(channelId: string) {
    for (const [key, tl] of Object.entries(chatState.get().timelines)) if (key === channelId || tl.items.some((m) => m.channelId === channelId)) chatState.putTimeline(key, { items: flag(channelId, tl.items) });
    recount(channelId);
    for (const [key, tl] of Object.entries(chatState.get().timelines)) if (key.startsWith('thread:') && tl.items.some((m) => m.channelId === channelId)) recount(channelId, key.slice(7));
  },

  async latest(channel: ChatChannelRow, threadId: string | null = null) {
    const key = keyOf(channel.id, threadId);
    chatState.putTimeline(key, { loading: true, error: null });
    try {
      const res = await http.get<{ messages: ChatMessageRow[]; more: boolean }>(`/chat/channels/${channel.id}/messages${threadId ? `?thread=${threadId}` : ''}`);
      merge(channel.id, threadId, await open(channel, res.messages), { more: res.more });
      chatState.putTimeline(key, { fetched: true });
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
    if (!held[channel.id] && !(row.threadId && held[keyOf(channel.id, row.threadId)])) {
      // not on screen, but an edit or deletion still has to reach this device's search index
      if (row.edits > 0) await open(channel, [row]);
      return null;
    }
    const [item, top] = await open(channel, root ? [row, root] : [row]);
    if (row.threadId) {
      if (chatState.get().timelines[keyOf(channel.id, row.threadId)]) merge(channel.id, row.threadId, [item]);
      if (top && chatState.get().timelines[channel.id]) merge(channel.id, null, [top]);
    } else if (chatState.get().timelines[channel.id]) merge(channel.id, null, [item]);
    return item;
  },

  // Opens one message without showing it anywhere, to know it checks out and whom it mentions.
  check: async (channel: ChatChannelRow, row: ChatMessageRow) => (await open(channel, [row]))[0],

  // Shows a message this tab is still sending, or replaces it with what the server kept.
  local: (item: ChatItem) => merge(item.channelId, item.threadId, [item]),
  drop(channelId: string, threadId: string | null, id: string) {
    const key = keyOf(channelId, threadId);
    chatState.putTimeline(key, { items: chatState.timeline(key).items.filter((m) => m.id !== id) });
  },

  // Everything that came while this tab wasn't listening, after a reconnect: each loaded timeline
  // of the conversation from its newest message on, a page at a time.
  async catchUp(channel: ChatChannelRow) {
    for (const [key, tl] of Object.entries(chatState.get().timelines)) {
      const threadId = key === channel.id ? null : key.startsWith('thread:') && tl.items.some((m) => m.channelId === channel.id) ? key.slice(7) : undefined;
      if (threadId === undefined || !tl.fetched) continue;
      let after = tl.items.reduce((n, m) => Math.max(n, m.seq), 0);
      for (let page = 0; page < 20; page++) {
        const thread = threadId ? `&thread=${threadId}` : '';
        const res = await http.get<{ messages: ChatMessageRow[]; more: boolean }>(`/chat/channels/${channel.id}/messages?after=${after}${thread}`).catch(() => null);
        if (!res?.messages.length) break;
        merge(channel.id, threadId, await open(channel, res.messages));
        after = res.messages[res.messages.length - 1].seq;
        if (!res.more) break;
      }
    }
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
