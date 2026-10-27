import express from 'express';
import keyChanges from '../chat/keyChanges.js';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import config from '../config.js';
import units from '../config/units.js';
import rateLimit from '../auth/rateLimit.js';
import chatId from '../chat/chatId.js';
import chatPeople from '../chat/chatPeople.js';
import channelAccess from '../chat/channelAccess.js';
import canManage from '../chat/canManage.js';
import memberList from '../chat/memberList.js';
import parseRoster from '../chat/parseRoster.js';
import takeGrants from '../chat/takeGrants.js';
import disappearAfter from '../chat/disappearAfter.js';
import toChannel from '../chat/toChannel.js';
import announceChat from '../chat/announceChat.js';
import eraseChannel from '../chat/eraseChannel.js';
import hub from '../realtime/hub.js';

const router = express.Router();
const META_CHARS = 8000;

const channelsPerHour = rateLimit({ windowMs: units.HOUR, max: config.chat.channelsPerHour, key: (req) => req.user.id, message: 'You’ve started a lot of conversations in the last hour. Wait a while and try again.' });
// reading up to a message and choosing what notifies you, both of which tell the person's other
// tabs, so a script can't flood them
const readsPerMinute = rateLimit({ windowMs: units.MINUTE, max: config.chat.messagesPerMinute, key: (req) => req.user.id, message: 'Too many updates in the last minute. Wait a moment and try again.' });

// Every conversation you're in, newest first.
router.get(
  '/chat',
  route((req) => {
    if (!chatPeople.includes(req.user.id)) return { channels: [] };
    const rows = sql.all("SELECT c.* FROM chat_channels c WHERE c.audience = 'team' OR EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id AND m.user_id = ?) ORDER BY c.last_at DESC", req.user.id);
    return { channels: rows.map((c) => toChannel(c, req.user)) };
  }),
);

// Starts a conversation with its first epoch: the member list the creator's browser signed and
// the key sealed to each of them. A direct message that already exists comes back instead.
router.post(
  '/chat/channels',
  channelsPerHour,
  route((req) => {
    const b = req.body ?? {};
    const me = req.user.id;
    if (!chatPeople.includes(me)) throw HttpError.forbidden();
    const id = chatId(b.id, 'Conversation id');
    const kind = check.oneOf(b.kind, ['channel', 'dm', 'group'], 'Kind');
    const audience = kind === 'channel' ? check.oneOf(b.audience ?? 'people', ['team', 'people'], 'Audience') : 'people';
    const members = audience === 'team' ? chatPeople.all() : memberList(b.members, kind, me);
    const pair = kind === 'dm' ? members.join(':') : null;
    const existing = pair && sql.get('SELECT * FROM chat_channels WHERE pair = ?', pair);
    if (existing) return { channel: toChannel(existing, req.user), existing: true };
    if (sql.get('SELECT 1 FROM chat_channels WHERE id = ?', id)) throw HttpError.badRequest('Pick a fresh conversation id.');
    const roster = parseRoster(b.roster, { channel: { id, kind, audience }, by: me, epoch: 1, prev: null });
    if (!roster.members.every((m) => members.includes(m))) throw HttpError.badRequest('The member list names someone who isn’t in this conversation.');
    const metaCt = b.metaCt === undefined || b.metaCt === null ? null : cipherText(b.metaCt, 'Name', { max: META_CHARS });
    if (kind === 'channel' && !metaCt) throw HttpError.badRequest('Give the channel a name.');
    const now = Date.now();
    const channel = { id, kind, audience };
    sql.tx(() => {
      sql.run(
        'INSERT INTO chat_channels (id, kind, audience, created_by, pair, meta_ct, meta_epoch, disappear_seconds, epoch, epoch_at, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
        id, kind, audience, me, pair, metaCt, metaCt ? 1 : null, disappearAfter(b.disappearSeconds), now, now, now,
      );
      if (audience === 'people') for (const userId of members) sql.run('INSERT INTO chat_members (channel_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)', id, userId, me, now);
      sql.run('INSERT INTO chat_epochs (channel_id, epoch, roster, created_by, created_at) VALUES (?, 1, ?, ?, ?)', id, b.roster, me, now);
      takeGrants(id, 1, b.grants, me, { exactly: roster.members });
      announceChat(channel, { kind: 'channel' });
    });
    return { channel: toChannel(sql.get('SELECT * FROM chat_channels WHERE id = ?', id), req.user) };
  }),
);

router.get(
  '/chat/channels/:id',
  route((req) => ({ channel: toChannel(channelAccess(req.params.id, req.user), req.user) })),
);

// A new name or topic, sealed under the current epoch's key and signed in the browser, a new
// disappearing-messages setting, or how many days a forward-secret conversation keeps old keys. Either is for whoever manages the channel; in a direct message
// both people can set how long messages stay.
router.patch(
  '/chat/channels/:id',
  keyChanges,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const b = req.body ?? {};
    const manages = canManage(channel, req.user);
    if (b.metaCt !== undefined) {
      // in a direct message, it's where both people's settings are signed
      if (!manages && channel.kind !== 'dm') throw HttpError.forbidden('Only whoever manages this conversation can rename it.');
      if (b.metaEpoch !== channel.epoch) throw new HttpError(409, 'This conversation has a new key. Try again.');
      sql.run('UPDATE chat_channels SET meta_ct = ?, meta_epoch = ? WHERE id = ?', cipherText(b.metaCt, 'Name', { max: META_CHARS }), channel.epoch, channel.id);
    }
    if (b.disappearSeconds !== undefined) {
      if (!manages && channel.kind !== 'dm') throw HttpError.forbidden('Only whoever manages this conversation can change how long messages stay.');
      sql.run('UPDATE chat_channels SET disappear_seconds = ? WHERE id = ?', disappearAfter(b.disappearSeconds), channel.id);
    }
    if (b.forwardDays !== undefined) {
      if (!manages && channel.kind !== 'dm') throw HttpError.forbidden('Only whoever manages this conversation can change how long its old keys are kept.');
      const days = b.forwardDays === null ? null : check.number(b.forwardDays, 'Days', { min: 1, max: config.chat.maxForwardDays, integer: true });
      sql.run('UPDATE chat_channels SET forward_days = ? WHERE id = ?', days, channel.id);
    }
    announceChat(channel, { kind: 'channel' });
    return { channel: toChannel(sql.get('SELECT * FROM chat_channels WHERE id = ?', channel.id), req.user) };
  }),
);

router.delete(
  '/chat/channels/:id',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    if (channel.kind !== 'channel' || !canManage(channel, req.user)) throw HttpError.forbidden('Only the channel’s creator or an admin can delete it.');
    announceChat(channel, { kind: 'gone' });
    eraseChannel(channel);
    return { ok: true };
  }),
);

router.put(
  '/chat/channels/:id/read',
  readsPerMinute,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const seq = check.number(req.body?.seq, 'Read position', { min: 0, max: channel.seq, integer: true }) ?? channel.seq;
    sql.run(
      'INSERT INTO chat_reads (channel_id, user_id, read_seq) VALUES (?, ?, ?) ON CONFLICT (channel_id, user_id) DO UPDATE SET read_seq = MAX(read_seq, excluded.read_seq)',
      channel.id, req.user.id, seq,
    );
    const readSeq = sql.get('SELECT read_seq FROM chat_reads WHERE channel_id = ? AND user_id = ?', channel.id, req.user.id).read_seq;
    // your other tabs and devices clear their counts too
    hub.toUser(req.user.id, { type: 'chat', channelId: channel.id, kind: 'read', readSeq });
    return { readSeq };
  }),
);

router.put(
  '/chat/channels/:id/notify',
  readsPerMinute,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const notify = check.oneOf(req.body?.notify, ['default', 'all', 'mentions', 'none'], 'Notifications');
    sql.run('INSERT INTO chat_reads (channel_id, user_id, notify) VALUES (?, ?, ?) ON CONFLICT (channel_id, user_id) DO UPDATE SET notify = excluded.notify', channel.id, req.user.id, notify);
    return { notify };
  }),
);

export default router;
