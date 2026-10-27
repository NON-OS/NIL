import express from 'express';
import keyChanges from '../chat/keyChanges.js';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import channelAccess from '../chat/channelAccess.js';
import channelMembers from '../chat/channelMembers.js';
import chatPeople from '../chat/chatPeople.js';
import parseStatement from '../chat/parseStatement.js';
import eraseChannel from '../chat/eraseChannel.js';
import announceChat from '../chat/announceChat.js';

const router = express.Router();

const remember = (channelId, userId, signedBy, statement) =>
  sql.run('INSERT INTO chat_departures (channel_id, user_id, signed_by, statement, created_at) VALUES (?, ?, ?, ?, ?)', channelId, userId, signedBy, statement, Date.now());

// Leaving a channel or group, with a statement the leaver's browser signed. Any member's browser
// can then start the next key without them, citing it; the server stops sending them anything
// from the conversation at once.
router.post(
  '/chat/channels/:id/leave',
  keyChanges,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    if (channel.audience === 'team' || channel.kind === 'dm') throw HttpError.badRequest('You can mute this conversation, but not leave it.');
    const statement = parseStatement(req.body?.statement, { by: req.user.id, kind: 'leave', channelId: channel.id, userId: req.user.id });
    sql.tx(() => {
      remember(channel.id, req.user.id, req.user.id, statement);
      sql.run('DELETE FROM chat_members WHERE channel_id = ? AND user_id = ?', channel.id, req.user.id);
      sql.run('DELETE FROM chat_reads WHERE channel_id = ? AND user_id = ?', channel.id, req.user.id);
    });
    if (!channelMembers(channel).length) eraseChannel(channel);
    else announceChat(channel, { kind: 'members' }, { also: [req.user.id] });
    return { ok: true };
  }),
);

// Sets a direct message aside so a fresh one between the same two people can start, for when its
// member lists stopped checking out in someone's browser. Nothing is erased: it stays, for both,
// with whatever can still be read in it.
router.post(
  '/chat/channels/:id/start-over',
  keyChanges,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    if (channel.kind !== 'dm') throw HttpError.badRequest('Only a direct message can start over.');
    sql.run('UPDATE chat_channels SET pair = NULL WHERE id = ?', channel.id);
    announceChat(channel, { kind: 'channel' });
    return { ok: true };
  }),
);

// An admin's signed statement that someone left the team, made as their browser deactivates them
// (or makes them a guest). Every conversation they were in can then get a new key from any of its
// members' browsers.
router.post(
  '/chat/removals',
  keyChanges,
  route((req) => {
    if (!req.user.isAdmin) throw HttpError.forbidden('Only admins can take someone out of the team.');
    const userId = String(req.body?.userId ?? '');
    if (!sql.get('SELECT 1 FROM users WHERE id = ?', userId) || chatPeople.includes(userId)) throw HttpError.badRequest('That person is still on the team.');
    remember(null, userId, req.user.id, parseStatement(req.body?.statement, { by: req.user.id, kind: 'removal', userId }));
    // every conversation whose current key they hold can now move on without them
    const held = sql.all('SELECT c.* FROM chat_channels c JOIN chat_epoch_keys k ON k.channel_id = c.id AND k.epoch = c.epoch WHERE k.user_id = ?', userId);
    for (const channel of held) announceChat(channel, { kind: 'channel' });
    return { ok: true };
  }),
);

export default router;
