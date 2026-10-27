import store from '../../state/store';
import chatState from '../../state/chatState';
import toast from '../../state/toast';
import router from '../../lib/router';
import chatChannels from './chatChannels';
import chatRosters from './chatRosters';
import chatTimeline from './chatTimeline';
import chatRead from './chatRead';
import chatTitle from './chatTitle';
import type ChatMessageRow from '../../types/ChatMessageRow';

const TYPING_MS = 4000;

// Says so in the app when a message comes in somewhere else: a direct or group message, or a
// mention. Only that it came and from whom; the words stay in the conversation.
function tell(channelId: string, senderId: string | null, mentioned: boolean) {
  const channel = chatState.get().channels[channelId];
  const name = (senderId ? store.get().users[senderId]?.name : null) ?? 'Someone';
  if (!channel) return;
  const line = channel.kind === 'dm' ? `${name} sent you a message` : `${name} ${mentioned ? 'mentioned you in' : 'wrote in'} ${chatTitle(channel)}`;
  toast.show(line, { action: { label: 'Open', run: () => router.navigate(`/chat/${channelId}`) } });
}

// Live changes to chat from the server, as `{ type: 'chat', channelId, kind, … }`.
export default async function chatEvents(event: any) {
  const s = chatState.get();
  const id = typeof event.channelId === 'string' ? event.channelId : null;
  if (!id || !s.loaded) return;
  const channel = s.channels[id];
  switch (event.kind) {
    case 'message': {
      if (!channel) return void chatChannels.refresh(id);
      const row = event.message as ChatMessageRow;
      const item = await chatTimeline.arrive(channel, row, event.root);
      const me = store.get().me?.id;
      const fresh = row.edits === 0 && row.kind === 'message' && !row.threadId;
      const watching = chatState.get().viewing === id && document.visibilityState === 'visible';
      const now = chatState.get().channels[id] ?? channel;
      const unread = fresh && row.senderId !== me && !watching ? now.unread + 1 : now.unread;
      chatState.set((st) => ({ channels: { ...st.channels, [id]: { ...now, seq: Math.max(now.seq, row.seq), lastAt: row.createdAt, unread } } }));
      if (fresh && watching) chatRead.mark(id, row.seq);
      const mentioned = me !== undefined && item.mentions.includes(me);
      const here = chatState.get().viewing === id;
      if (row.edits === 0 && row.kind === 'message' && row.senderId !== me && !here && (channel.kind !== 'channel' || mentioned) && channel.notify !== 'none') tell(id, row.senderId, mentioned);
      return;
    }
    case 'typing': {
      const until = Date.now() + TYPING_MS;
      chatState.set((st) => ({ typing: { ...st.typing, [id]: { ...(st.typing[id] ?? {}), [event.userId]: until } } }));
      return;
    }
    case 'read':
      if (channel) chatState.set((st) => ({ channels: { ...st.channels, [id]: { ...channel, readSeq: event.readSeq, unread: 0 } } }));
      return;
    case 'gone':
      return chatChannels.drop(id);
    case 'keys':
    case 'epoch': {
      chatRosters.forget(id);
      const next = await chatChannels.refresh(id);
      if (next) await chatTimeline.reopen(next);
      return;
    }
    default:
      await chatChannels.refresh(id);
  }
}
