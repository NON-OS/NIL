import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import sessions from '../auth/sessions.js';
import hub from '../realtime/hub.js';
import publishUser from '../services/publishUser.js';
import eraseUser from '../services/eraseUser.js';
import toUser from '../mappers/toUser.js';
import voterGroups from '../votes/voterGroups.js';
import guestScope from '../services/guestScope.js';
import lostAccess from '../services/lostAccess.js';
import seatGate from '../services/seatGate.js';
import adminLeft from '../services/adminLeft.js';
import revokeInvitesBy from '../services/revokeInvitesBy.js';

const router = express.Router();
const isAdminRole = (role) => role === 'owner' || role === 'admin';

function target(req) {
  const row = sql.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw HttpError.notFound('That person');
  if (row.kind === 'agent') throw HttpError.badRequest('Agents are managed in Settings → Agents.');
  if (row.id === req.user.id) throw HttpError.badRequest('You can’t change your own access. Ask another admin.');
  if (row.role === 'owner' && req.user.role !== 'owner') throw HttpError.forbidden('Only an owner can change another owner.');
  // otherwise one admin could demote the others and be the only one left to reset an owner
  if (row.role === 'admin' && req.user.role !== 'owner') throw HttpError.forbidden('Only an owner can change another admin.');
  return row;
}

router.patch(
  '/users/:id',
  requireAdmin,
  route((req) => {
    const row = target(req);
    // All of it or none of it: a check that fails halfway, such as a seat that isn't free,
    // leaves the person as they were. Open tabs hear about it once it's saved.
    try {
      sql.tx(() => {
        if ('role' in req.body) {
          const role = check.oneOf(req.body.role, domain.roles, 'Role');
          if (role === 'owner' && req.user.role !== 'owner') throw HttpError.forbidden('Only an owner can make someone an owner.');
          // a guest becoming a member takes a seat, the same as someone new joining
          if (row.role === 'guest' && role !== 'guest' && !row.deactivated) seatGate(role);
          sql.run('UPDATE users SET role = ? WHERE id = ?', role, row.id);
          if (isAdminRole(row.role) && !isAdminRole(role)) adminLeft(row.id, req.user.id);
          if (!isAdminRole(row.role) && isAdminRole(role)) sql.run('UPDATE users SET admin_since = ? WHERE id = ?', Date.now(), row.id);
          // guests don't vote: becoming one empties your seat in open anonymous votes, and back again
          if (role === 'guest') voterGroups.leave(row.id);
          else voterGroups.join(row.id);
          // a guest is in no conversation, and becoming a member again doesn't bring them back into
          // private ones; their browsers' signed lists leave them out of the key from here
          if (role === 'guest') {
            sql.run('DELETE FROM chat_members WHERE user_id = ?', row.id);
            sql.run('DELETE FROM chat_reads WHERE user_id = ?', row.id);
          }
          if (role !== 'guest') sql.run('DELETE FROM project_guests WHERE user_id = ?', row.id);
          // a member again: a signed removal from when they were made a guest no longer counts
          if (role !== 'guest' && row.role === 'guest') sql.run('DELETE FROM chat_departures WHERE user_id = ? AND channel_id IS NULL', row.id);
          guestScope.forget(row.id);
          lostAccess.user(row.id);
          sql.afterCommit(() => {
            hub.setAdmin(row.id, isAdminRole(role));
            hub.presenceChanged();
            // a member made a guest loses live docs, chat and calls at once: their tabs reconnect as a guest's
            if (role === 'guest' && row.role !== 'guest') hub.disconnect(row.id);
          });
        }
        // The projects a guest can see. Changing them takes effect on their next request.
        if (Array.isArray(req.body.projects)) {
          if (sql.get('SELECT role FROM users WHERE id = ?', row.id).role !== 'guest') throw HttpError.badRequest('Only guests are limited to projects.');
          sql.run('DELETE FROM project_guests WHERE user_id = ?', row.id);
          for (const id of req.body.projects.filter((p) => typeof p === 'string')) sql.run('INSERT OR IGNORE INTO project_guests (project_id, user_id) SELECT id, ? FROM projects WHERE id = ?', row.id, id);
          guestScope.forget(row.id);
          lostAccess.user(row.id);
          sql.afterCommit(() => hub.presenceChanged());
        }
        // Lets someone who joined by holding NOX stay without the balance check.
        if (req.body.keepWithoutNox === true) sql.run("UPDATE users SET joined_via = 'invite' WHERE id = ? AND joined_via = 'holder'", row.id);
        if ('deactivated' in req.body) {
          const off = Boolean(req.body.deactivated);
          // coming back takes a seat again, so access can't be switched off before paying for fewer seats and on after
          const role = sql.get('SELECT role FROM users WHERE id = ?', row.id).role;
          if (!off && row.deactivated) seatGate(role);
          sql.run('UPDATE users SET deactivated = ? WHERE id = ?', off ? 1 : 0, row.id);
          // back on the team: a signed removal from before no longer says anything about them
          if (!off) sql.run('DELETE FROM chat_departures WHERE user_id = ? AND channel_id IS NULL', row.id);
          // an admin let back in starts over as a new admin when it comes to approving owner resets
          if (!off && row.deactivated && isAdminRole(role)) sql.run('UPDATE users SET admin_since = ? WHERE id = ?', Date.now(), row.id);
          if (off) voterGroups.leave(row.id);
          else voterGroups.join(row.id);
          if (off) {
            sessions.revokeAll(row.id);
            if (isAdminRole(role) && !row.deactivated) adminLeft(row.id, req.user.id);
            else revokeInvitesBy(row.id);
            sql.afterCommit(() => hub.disconnect(row.id));
          }
        }
      });
    } finally {
      // what was cached during the change may describe what was rolled back
      guestScope.forget(row.id);
    }
    return { user: toUser(publishUser(row.id), req.viewer) };
  }),
);

router.get(
  '/users/:id/projects',
  requireAdmin,
  route((req) => ({ projectIds: sql.all('SELECT project_id FROM project_guests WHERE user_id = ?', req.params.id).map((r) => r.project_id) })),
);

router.delete(
  '/users/:id',
  requireAdmin,
  route((req) => {
    const row = target(req);
    if (!row.deactivated) throw HttpError.badRequest('Remove their access first, then delete the account.');
    eraseUser(row.id);
    return { ok: true };
  }),
);

export default router;
