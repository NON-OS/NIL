import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import channelAccess from '../chat/channelAccess.js';
import channelMembers from '../chat/channelMembers.js';
import canManage from '../chat/canManage.js';
import memberList from '../chat/memberList.js';
import parseRoster from '../chat/parseRoster.js';
import takeGrants from '../chat/takeGrants.js';
import announceChat from '../chat/announceChat.js';
import hub from '../realtime/hub.js';

const router = express.Router();

const holders = (channelId, epoch) => sql.all('SELECT user_id FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ?', channelId, epoch).map((r) => r.user_id);

// Every epoch's signed member list from `from` on, with your own sealed copy of each key you
// were given. Browsers check the chain of lists from the first epoch, so they're all here.
router.get(
  '/chat/channels/:id/epochs',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const from = check.number(req.query.from, 'From', { min: 1, integer: true }) ?? 1;
    const rows = sql.all(
      'SELECT e.epoch, e.roster, e.created_by, e.created_at, k.wrapped_key FROM chat_epochs e LEFT JOIN chat_epoch_keys k ON k.channel_id = e.channel_id AND k.epoch = e.epoch AND k.user_id = ? WHERE e.channel_id = ? AND e.epoch >= ? ORDER BY e.epoch LIMIT 1000',
      req.user.id, channel.id, from,
    );
    return { epochs: rows.map((r) => ({ epoch: r.epoch, roster: r.roster, createdBy: r.created_by, createdAt: r.created_at, wrappedKey: r.wrapped_key })) };
  }),
);

// Starts the next epoch: a fresh key sealed to everyone on the signed member list. It's how
// people join and leave. Anyone in the conversation may start one for the same people (the
// schedule) or, in a team channel, to bring in a teammate; changing who is in it otherwise, or
// leaving out anyone who holds the current key, is for whoever manages it.
router.post(
  '/chat/channels/:id/epochs',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const b = req.body ?? {};
    if (b.epoch !== channel.epoch + 1) throw new HttpError(409, 'Someone else just gave this conversation a new key. Try again.');
    const roster = parseRoster(b.roster, { channel, by: req.user.id });
    const before = channelMembers(channel);
    const after = channel.audience === 'team' || b.members === undefined ? before : memberList(b.members, channel.kind, req.user.id);
    const manages = canManage(channel, req.user);
    const changed = after.length !== before.length || after.some((id) => !before.includes(id));
    if (changed && (channel.kind === 'dm' || !manages)) throw HttpError.forbidden('Only whoever manages this conversation can change who is in it.');
    if (!roster.members.every((id) => after.includes(id))) throw HttpError.badRequest('The member list names someone who isn’t in this conversation.');
    const dropped = holders(channel.id, channel.epoch).filter((id) => after.includes(id) && !roster.members.includes(id));
    if (dropped.length && !manages) throw HttpError.forbidden('Only whoever manages this conversation can leave someone out of its new key.');
    const now = Date.now();
    sql.tx(() => {
      sql.run('INSERT INTO chat_epochs (channel_id, epoch, roster, created_by, created_at) VALUES (?, ?, ?, ?, ?)', channel.id, b.epoch, b.roster, req.user.id, now);
      sql.run('UPDATE chat_channels SET epoch = ?, epoch_at = ? WHERE id = ?', b.epoch, now, channel.id);
      if (channel.audience === 'people' && changed) {
        for (const id of before.filter((m) => !after.includes(m))) {
          sql.run('DELETE FROM chat_members WHERE channel_id = ? AND user_id = ?', channel.id, id);
          sql.run('DELETE FROM chat_reads WHERE channel_id = ? AND user_id = ?', channel.id, id);
        }
        for (const id of after.filter((m) => !before.includes(m))) sql.run('INSERT INTO chat_members (channel_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)', channel.id, id, req.user.id, now);
      }
      takeGrants(channel.id, b.epoch, b.grants, req.user.id, { exactly: roster.members });
      announceChat(channel, { kind: 'epoch', epoch: b.epoch }, { also: before.filter((m) => !after.includes(m)) });
    });
    return { epoch: b.epoch };
  }),
);

// Earlier epochs' keys, for someone who joined after them, so they can read back. Only someone
// who holds that epoch's key can have sealed it, and only to people in the conversation now.
router.post(
  '/chat/channels/:id/grants',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const epoch = check.number(req.body?.epoch, 'Epoch', { min: 1, max: channel.epoch, integer: true });
    if (!epoch || !holders(channel.id, epoch).includes(req.user.id)) throw HttpError.forbidden('You don’t hold that key.');
    const given = takeGrants(channel.id, epoch, req.body?.grants, req.user.id, { members: channelMembers(channel) });
    for (const userId of given) hub.toUser(userId, { type: 'chat', channelId: channel.id, kind: 'keys' });
    return { ok: true };
  }),
);

export default router;
