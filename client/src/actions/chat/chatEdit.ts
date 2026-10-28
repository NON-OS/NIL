import http from '../../api/http';
import chatState from '../../state/chatState';
import chatKeys from './chatKeys';
import chatTimeline from './chatTimeline';
import sealMessage from './sealMessage';
import sealGate from './sealGate';
import chatMarks from './chatMarks';
import type ChatItem from '../../types/ChatItem';
import type ChatMessageRow from '../../types/ChatMessageRow';

// Signs a message again with the next edit number, keeping its place in its sender's stream,
// under the conversation's current key. A deletion is the same with nothing left in it.
async function rewrite(item: ChatItem, text: string | null) {
  const channel = chatState.get().channels[item.channelId];
  if (!channel) throw new Error('This conversation is gone.');
  const key = await chatKeys.get(channel, await sealGate(channel), channel.epoch);
  if (!key) throw new Error('You don’t hold this conversation’s key yet.');
  const deleted = text === null;
  const edit = item.edit + 1;
  const ttl = item.expiresAt ? Math.round((item.expiresAt - item.sentAt) / 1000) : null;
  const facts = { type: deleted ? ('deleted' as const) : item.type, edit, stream: item.stream, n: item.n, thread: item.threadId, ttl };
  const content = deleted ? {} : { text, files: item.files, mentions: item.mentions, emoji: item.emoji, target: item.target };
  const bodyCt = await sealMessage({ id: item.id, channelId: channel.id, epoch: channel.epoch, sentAt: item.sentAt, key, facts, content });
  const { message } = await http.put<{ message: ChatMessageRow }>(`/chat/messages/${item.id}`, { epoch: channel.epoch, bodyCt, edits: edit, deleted });
  chatMarks.edit(channel.id, item.id, edit, deleted);
  return chatTimeline.arrive(channel, message);
}

// Editing and deleting your own messages, and taking back a reaction.
const chatEdit = {
  edit: (item: ChatItem, text: string) => rewrite(item, text),
  remove: (item: ChatItem) => rewrite(item, null),
};

export default chatEdit;
