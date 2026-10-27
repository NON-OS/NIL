import sql from '../db/sql.js';
import config from '../config.js';
import hub from '../realtime/hub.js';
import log from '../lib/log.js';
import subscriptions from '../push/subscriptions.js';
import sendPush from '../push/sendPush.js';

// The whole of every chat push: no words, no channel name, no sender. The server can't read them,
// and a lock screen shouldn't say even who is talking. Tapping it opens the chat, which unlocks
// and shows the rest.
const MESSAGE = Object.freeze({ title: 'New message', tag: 'nil-chat', chat: true });

const lastSent = new Map();

const online = (userId) => {
  for (const [, c] of hub.entries()) if (c.userId === userId) return true;
  return false;
};

// Who wants a push for this message: by default everyone in a direct or group message, and in a
// channel the people its sender mentioned. Someone with Nil open hears it from the app instead.
function wanted(channel, userId, pinged) {
  const choice = sql.get('SELECT notify FROM chat_reads WHERE channel_id = ? AND user_id = ?', channel.id, userId)?.notify ?? 'default';
  if (choice === 'none') return false;
  if (choice === 'all' || (choice === 'default' && channel.kind !== 'channel')) return true;
  return pinged.has(userId);
}

async function deliver(userId) {
  for (const device of subscriptions.of(userId)) {
    const result = await sendPush(device, MESSAGE, { urgency: 'normal' });
    if (result === 'gone') subscriptions.drop(device.id);
    else if (result === 'sent') subscriptions.touch(device.id);
  }
}

// Runs after the message is saved and never throws; a push service that's down costs a push.
export default function chatPush(channel, senderId, recipients, pinged) {
  if (!config.push.enabled) return;
  const now = Date.now();
  for (const userId of recipients) {
    if (userId === senderId || !wanted(channel, userId, pinged) || online(userId)) continue;
    const key = `${userId}:${channel.id}`;
    if (now - (lastSent.get(key) ?? 0) < config.chat.pushQuietMs) continue;
    lastSent.set(key, now);
    setImmediate(() => deliver(userId).catch((err) => log.error('push', 'could not deliver a chat notification', err.message)));
  }
  if (lastSent.size > 10_000) for (const [key, at] of lastSent) if (now - at > config.chat.pushQuietMs) lastSent.delete(key);
}
