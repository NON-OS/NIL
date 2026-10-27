import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import config from '../config.js';
import units from '../config/units.js';
import rateLimit from '../auth/rateLimit.js';
import chatId from '../chat/chatId.js';
import channelAccess from '../chat/channelAccess.js';
import channelMembers from '../chat/channelMembers.js';
import toChatMessage from '../chat/toChatMessage.js';
import announceChat from '../chat/announceChat.js';
import chatPush from '../chat/chatPush.js';
import dropChatFiles from '../chat/dropChatFiles.js';

const router = express.Router();
const MAX_FILES = 10;
const MAX_PINGS = 100;

const messagesPerMinute = rateLimit({ windowMs: units.MINUTE, max: config.chat.messagesPerMinute, key: (req) => req.user.id, message: 'You’ve sent a lot of messages in the last minute. Wait a moment and try again.' });

const live = () => Date.now();
const holds = (channelId, epoch, userId) => Boolean(sql.get('SELECT 1 FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ? AND user_id = ?', channelId, epoch, userId));

// What a browser seals a message under has to be the conversation's current key, held by the
// sender; a message under an older key would leave out someone who joined since.
function currentEpoch(channel, epoch, userId) {
  if (epoch !== channel.epoch) throw new HttpError(409, 'This conversation has a new key. Try again.');
  if (!holds(channel.id, epoch, userId)) throw HttpError.forbidden('You don’t hold this conversation’s key yet.');
}

function idList(value, max, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) throw HttpError.badRequest(`Too many ${field}.`);
  return [...new Set(value.map(String))];
}

// A page of a conversation's main timeline, or of one thread, in order. Disappearing messages
// whose time is up are left out even before the sweep removes them.
router.get(
  '/chat/channels/:id/messages',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const limit = check.number(req.query.limit, 'Limit', { min: 1, max: 200, integer: true }) ?? config.chat.pageSize;
    const before = check.number(req.query.before, 'Before', { min: 0, integer: true });
    const after = check.number(req.query.after, 'After', { min: 0, integer: true });
    const thread = req.query.thread === undefined ? null : chatId(req.query.thread, 'Thread');
    const where = ['channel_id = ?', '(expires_at IS NULL OR expires_at > ?)', thread ? '(thread_id = ? OR id = ?)' : 'thread_id IS NULL'];
    const params = [channel.id, live(), ...(thread ? [thread, thread] : [])];
    for (const [op, value] of [['<', before], ['>', after]]) {
      if (value === null) continue;
      where.push(`seq ${op} ?`);
      params.push(value);
    }
    const newest = after === null;
    const rows = sql.all(`SELECT * FROM chat_messages WHERE ${where.join(' AND ')} ORDER BY seq ${newest ? 'DESC' : 'ASC'} LIMIT ?`, ...params, limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    if (newest) page.reverse();
    return { messages: page.map(toChatMessage), more };
  }),
);

router.post(
  '/chat/channels/:id/messages',
  messagesPerMinute,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const b = req.body ?? {};
    const me = req.user.id;
    const id = chatId(b.id, 'Message id');
    const kind = check.oneOf(b.kind ?? 'message', ['message', 'reaction'], 'Kind');
    currentEpoch(channel, b.epoch, me);
    const now = live();
    if (!Number.isSafeInteger(b.sentAt) || Math.abs(b.sentAt - now) > config.chat.clockSkewMs) throw HttpError.badRequest('This device’s clock is off. Set it right and try again.');
    if ((b.ttl ?? null) !== channel.disappear_seconds) throw new HttpError(409, 'How long messages stay in this conversation just changed. Try again.');
    const bodyCt = cipherText(b.bodyCt, 'Message', { max: config.chat.messageChars });
    const threadId = b.threadId === undefined || b.threadId === null ? null : chatId(b.threadId, 'Thread');
    if (threadId && !sql.get("SELECT 1 FROM chat_messages WHERE id = ? AND channel_id = ? AND thread_id IS NULL AND kind = 'message' AND deleted = 0", threadId, channel.id)) throw HttpError.badRequest('That thread no longer exists.');
    const files = idList(b.files, MAX_FILES, 'files');
    if (files.length && kind !== 'message') throw HttpError.badRequest('Only a message can carry files.');
    for (const f of files) if (!sql.get('SELECT 1 FROM chat_files WHERE id = ? AND channel_id = ? AND uploader_id = ? AND message_id IS NULL', f, channel.id, me)) throw HttpError.badRequest('One of those files isn’t ready to send.');
    const members = channelMembers(channel);
    const pinged = new Set(idList(b.ping, MAX_PINGS, 'mentions').filter((u) => members.includes(u)));
    if (sql.get('SELECT 1 FROM chat_messages WHERE id = ?', id)) throw new HttpError(409, 'That message was already sent.');
    const expiresAt = channel.disappear_seconds ? now + channel.disappear_seconds * 1000 : null;
    let row;
    sql.tx(() => {
      const seq = sql.get('SELECT seq FROM chat_channels WHERE id = ?', channel.id).seq + 1;
      sql.run(
        'INSERT INTO chat_messages (id, channel_id, seq, thread_id, kind, sender_id, epoch, sent_at, body_ct, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, channel.id, seq, threadId, kind, me, b.epoch, b.sentAt, bodyCt, now, now, expiresAt,
      );
      sql.run('UPDATE chat_channels SET seq = ?, last_at = ? WHERE id = ?', seq, now, channel.id);
      if (threadId && kind === 'message') sql.run('UPDATE chat_messages SET replies = replies + 1, last_reply_at = ? WHERE id = ?', now, threadId);
      for (const f of files) sql.run('UPDATE chat_files SET message_id = ? WHERE id = ?', id, f);
      row = sql.get('SELECT * FROM chat_messages WHERE id = ?', id);
      announceChat(channel, { kind: 'message', message: toChatMessage(row), ...(threadId && kind === 'message' ? { root: toChatMessage(sql.get('SELECT * FROM chat_messages WHERE id = ?', threadId)) } : {}) });
    });
    if (kind === 'message') chatPush(channel, me, members, pinged);
    return { message: toChatMessage(row) };
  }),
);

// An edit or a deletion: the sender's browser seals and signs the message again with the next
// edit number. A deletion leaves a signed tombstone in its place, so the sender's count of
// messages stays whole, and its files go.
router.put(
  '/chat/messages/:id',
  messagesPerMinute,
  route((req) => {
    const row = sql.get('SELECT * FROM chat_messages WHERE id = ?', String(req.params.id));
    if (!row) throw HttpError.notFound('That message');
    const channel = channelAccess(row.channel_id, req.user);
    const b = req.body ?? {};
    if (row.sender_id !== req.user.id) throw HttpError.forbidden('Only whoever sent a message can change it.');
    if (row.deleted) throw HttpError.badRequest('That message was deleted.');
    if (b.edits !== row.edits + 1) throw new HttpError(409, 'That message changed in the meantime. Try again.');
    currentEpoch(channel, b.epoch, req.user.id);
    const bodyCt = cipherText(b.bodyCt, 'Message', { max: config.chat.messageChars });
    const deleted = b.deleted === true;
    sql.tx(() => {
      sql.run('UPDATE chat_messages SET body_ct = ?, epoch = ?, edits = ?, deleted = ?, updated_at = ? WHERE id = ?', bodyCt, b.epoch, b.edits, deleted ? 1 : 0, live(), row.id);
      if (deleted) {
        dropChatFiles('message_id = ?', row.id);
        if (row.thread_id && row.kind === 'message') sql.run('UPDATE chat_messages SET replies = MAX(replies - 1, 0) WHERE id = ?', row.thread_id);
      }
      announceChat(channel, { kind: 'message', message: toChatMessage(sql.get('SELECT * FROM chat_messages WHERE id = ?', row.id)) });
    });
    return { message: toChatMessage(sql.get('SELECT * FROM chat_messages WHERE id = ?', row.id)) };
  }),
);

export default router;
