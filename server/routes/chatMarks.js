import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import config from '../config.js';
import units from '../config/units.js';
import rateLimit from '../auth/rateLimit.js';
import channelAccess from '../chat/channelAccess.js';
import wrapsFor from '../chat/wrapsFor.js';
import announceChat from '../chat/announceChat.js';

const router = express.Router();
const STREAM = /^[A-Za-z0-9_-]{16}$/;
const MARK_CHARS = 16 * 1024;
// a person's sending tabs kept per conversation; a new one past this lets go of their oldest, so
// nobody can crowd out anyone else's
const STREAMS_PER_PERSON = 20;

const marksPerMinute = rateLimit({ windowMs: units.MINUTE, max: config.chat.messagesPerMinute, key: (req) => req.user.id, message: 'Too many updates in the last minute. Wait a moment and try again.' });

const toMark = (r) => ({ userId: r.user_id, stream: r.stream, epoch: r.epoch, sentAt: r.sent_at, bodyCt: r.body_ct });

// Each sending tab's high-water mark in a conversation: how far it has numbered what it sent,
// sealed and signed in the browser. Members compare it with what the server delivered, which
// shows when the last message of a tab was held back.
router.get(
  '/chat/channels/:id/marks',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    return { marks: sql.all('SELECT * FROM chat_marks WHERE channel_id = ? ORDER BY updated_at DESC LIMIT ?', channel.id, STREAMS_PER_PERSON * config.chat.maxMembers).map(toMark) };
  }),
);

router.put(
  '/chat/channels/:id/marks/:stream',
  marksPerMinute,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const stream = String(req.params.stream);
    const b = req.body ?? {};
    if (!STREAM.test(stream)) throw HttpError.badRequest('That isn’t a stream Nil knows.');
    if (b.epoch !== channel.epoch || !wrapsFor(channel.id, b.epoch, req.user.id).length) throw new HttpError(409, 'This conversation has a new key. Try again.');
    const now = Date.now();
    if (!Number.isSafeInteger(b.sentAt) || Math.abs(b.sentAt - now) > config.chat.clockSkewMs) throw HttpError.badRequest('This device’s clock is off. Set it right and try again.');
    const bodyCt = cipherText(b.bodyCt, 'Mark', { max: MARK_CHARS });
    // a stream is filed under its sender, so nobody can take another's
    const held = sql.get('SELECT sent_at FROM chat_marks WHERE channel_id = ? AND user_id = ? AND stream = ?', channel.id, req.user.id, stream);
    // a mark only moves forward
    if (held && held.sent_at >= b.sentAt) return { ok: true };
    sql.run(
      `INSERT INTO chat_marks (channel_id, user_id, stream, epoch, sent_at, body_ct, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (channel_id, user_id, stream) DO UPDATE SET epoch = excluded.epoch, sent_at = excluded.sent_at, body_ct = excluded.body_ct, updated_at = excluded.updated_at`,
      channel.id, req.user.id, stream, b.epoch, b.sentAt, bodyCt, now,
    );
    if (!held) {
      sql.run(
        'DELETE FROM chat_marks WHERE channel_id = ? AND user_id = ? AND stream NOT IN (SELECT stream FROM chat_marks WHERE channel_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ?)',
        channel.id, req.user.id, channel.id, req.user.id, STREAMS_PER_PERSON,
      );
    }
    announceChat(channel, { kind: 'mark', mark: toMark(sql.get('SELECT * FROM chat_marks WHERE channel_id = ? AND user_id = ? AND stream = ?', channel.id, req.user.id, stream)) });
    return { ok: true };
  }),
);

export default router;
