import express from 'express';
import keyChanges from '../chat/keyChanges.js';
import channelKeyChanges from '../chat/channelKeyChanges.js';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import channelAccess from '../chat/channelAccess.js';
import channelMembers from '../chat/channelMembers.js';
import canManage from '../chat/canManage.js';
import memberList from '../chat/memberList.js';
import parseRoster from '../chat/parseRoster.js';
import takeGrants from '../chat/takeGrants.js';
import departures from '../chat/departures.js';
import wrapsFor from '../chat/wrapsFor.js';
import announceChat from '../chat/announceChat.js';
import hub from '../realtime/hub.js';

const router = express.Router();
const MAX_PROOFS = 500;

const holders = (channelId, epoch) => sql.all('SELECT user_id FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ?', channelId, epoch).map((r) => r.user_id);

// The signed departures a new epoch cites for the people it leaves out: each has to be one the
// server holds for someone leaving this conversation. Returns who they prove gone, and what to
// store with the epoch; browsers check the signatures again.
function proofsFor(channel, raw) {
  if (raw === undefined) raw = [];
  if (!Array.isArray(raw) || raw.length > MAX_PROOFS || !raw.every((p) => typeof p === 'string' && p.length <= 4096)) throw HttpError.badRequest('Those departures aren’t ones Nil can read.');
  const cited = departures(channel).filter((d) => d.statement && raw.includes(d.statement));
  return { proven: cited.map((d) => d.userId), stored: cited.map((d) => d.statement) };
}

// Every epoch's signed member list from `from` on, the departures it cites, and your own sealed
// copies of each key you were given. Browsers check the chain of lists from the first epoch.
router.get(
  '/chat/channels/:id/epochs',
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const from = check.number(req.query.from, 'From', { min: 1, integer: true }) ?? 1;
    const rows = sql.all('SELECT epoch, roster, proofs, created_by, created_at FROM chat_epochs WHERE channel_id = ? AND epoch >= ? ORDER BY epoch LIMIT 1000', channel.id, from);
    return {
      epochs: rows.map((r) => ({
        epoch: r.epoch,
        roster: r.roster,
        proofs: parseJSON(r.proofs, []),
        createdBy: r.created_by,
        createdAt: r.created_at,
        wrappedKeys: r.epoch > channel.purged_epoch ? wrapsFor(channel.id, r.epoch, req.user.id) : [],
      })),
    };
  }),
);

// Starts the next epoch: a fresh key sealed to everyone on the signed member list. It's how
// people join and leave. Anyone in the conversation may start one for the same people (the
// schedule), bring a teammate into a team channel, or leave out someone who left, citing their
// signed departure. Changing who is in it otherwise is for whoever manages it.
router.post(
  '/chat/channels/:id/epochs',
  keyChanges,
  channelKeyChanges,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const b = req.body ?? {};
    if (b.epoch !== channel.epoch + 1) throw new HttpError(409, 'Someone else just gave this conversation a new key. Try again.');
    const prev = sql.get('SELECT roster FROM chat_epochs WHERE channel_id = ? AND epoch = ?', channel.id, channel.epoch)?.roster ?? null;
    const cited = proofsFor(channel, b.proofs);
    const roster = parseRoster(b.roster, { channel, by: req.user.id, epoch: b.epoch, prev, proven: cited.proven });
    const before = channelMembers(channel);
    const after = channel.audience === 'team' || b.members === undefined ? before : memberList(b.members, channel.kind, req.user.id);
    // managing takes both: the server's say on who may change the people, and the signed list's
    // on who may sign for it, which is what every browser checks
    const manages = canManage(channel, req.user) && roster.manager;
    const changed = after.length !== before.length || after.some((id) => !before.includes(id));
    if (changed && (channel.kind === 'dm' || !manages)) throw HttpError.forbidden('Only whoever manages this conversation can change who is in it.');
    if (!roster.members.every((id) => after.includes(id))) throw HttpError.badRequest('The member list names someone who isn’t in this conversation.');
    const current = holders(channel.id, channel.epoch);
    const kept = current.filter((id) => after.includes(id) && !roster.members.includes(id));
    if (kept.length && !manages) throw HttpError.forbidden('Only whoever manages this conversation can leave someone out of its new key.');
    // whoever the server has as out has to be proven gone too, unless a manager leaves them out
    if (!manages && current.some((id) => !after.includes(id) && !cited.proven.includes(id))) throw HttpError.forbidden('Only whoever manages this conversation can leave someone out of its new key without their signed leaving.');
    const proofs = cited.stored;
    const now = Date.now();
    sql.tx(() => {
      sql.run('INSERT INTO chat_epochs (channel_id, epoch, roster, proofs, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', channel.id, b.epoch, b.roster, proofs.length ? JSON.stringify(proofs) : null, req.user.id, now);
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
// Keys a forward-secret conversation has let go of can't come back.
router.post(
  '/chat/channels/:id/grants',
  keyChanges,
  route((req) => {
    const channel = channelAccess(req.params.id, req.user);
    const epoch = check.number(req.body?.epoch, 'Epoch', { min: channel.purged_epoch + 1, max: channel.epoch, integer: true });
    if (!epoch || !wrapsFor(channel.id, epoch, req.user.id).length) throw HttpError.forbidden('You don’t hold that key.');
    const given = takeGrants(channel.id, epoch, req.body?.grants, req.user.id, { members: channelMembers(channel), history: true });
    for (const userId of given) hub.toUser(userId, { type: 'chat', channelId: channel.id, kind: 'keys' });
    return { ok: true };
  }),
);

export default router;
