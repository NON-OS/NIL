import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import channelMembers from './channelMembers.js';
import chatPeople from './chatPeople.js';

const INTERVAL_MS = 1500;

// "Someone is typing" in a conversation, for its other members only. Nobody can claim to type
// in a conversation they aren't in, and a tab gets one hint through every INTERVAL_MS.
export default function chatTyping(client, msg) {
  const now = Date.now();
  if (typeof msg.channelId !== 'string' || now - (client.lastChatTyping ?? 0) < INTERVAL_MS) return;
  client.lastChatTyping = now;
  const channel = sql.get('SELECT * FROM chat_channels WHERE id = ?', msg.channelId.slice(0, 32));
  if (!channel || !chatPeople.includes(client.userId)) return;
  const members = channelMembers(channel);
  if (!members.includes(client.userId)) return;
  // a thread has to be a first message of this conversation, so nobody fills others' tabs with made-up ones
  const thread = typeof msg.threadId === 'string' ? msg.threadId.slice(0, 32) : null;
  if (thread && !sql.get("SELECT 1 FROM chat_messages WHERE id = ? AND channel_id = ? AND thread_id IS NULL AND kind = 'message'", thread, channel.id)) return;
  const event = { type: 'chat', channelId: channel.id, kind: 'typing', userId: client.userId, threadId: thread };
  hub.toUsers(members.filter((userId) => userId !== client.userId), event);
}
