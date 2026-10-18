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
  return row;
}

router.patch(
  '/users/:id',
  requireAdmin,
  route((req) => {
    const row = target(req);
    if ('role' in req.body) {
      const role = check.oneOf(req.body.role, domain.roles, 'Role');
      if (role === 'owner' && req.user.role !== 'owner') throw HttpError.forbidden('Only an owner can make someone an owner.');
      // a guest becoming a member takes a seat, the same as someone new joining
      if (row.role === 'guest' && role !== 'guest' && !row.deactivated) seatGate(role);
      sql.run('UPDATE users SET role = ? WHERE id = ?', role, row.id);
      if (isAdminRole(row.role) && !isAdminRole(role)) adminLeft(row.id, req.user.id);
      // guests don't vote: becoming one empties your seat in open anonymous votes, and back again
      if (role === 'guest') voterGroups.leave(row.id);
      else voterGroups.join(row.id);
      if (role !== 'guest') sql.run('DELETE FROM project_guests WHERE user_id = ?', row.id);
      guestScope.forget(row.id);
      lostAccess.user(row.id);
      hub.setAdmin(row.id, role === 'owner' || role === 'admin');
      hub.presenceChanged();
    }
    // The projects a guest can see. Changing them takes effect on their next request.
    if (Array.isArray(req.body.projects)) {
      if (sql.get('SELECT role FROM users WHERE id = ?', row.id).role !== 'guest') throw HttpError.badRequest('Only guests are limited to projects.');
      sql.tx(() => {
        sql.run('DELETE FROM project_guests WHERE user_id = ?', row.id);
        for (const id of req.body.projects.filter((p) => typeof p === 'string')) sql.run('INSERT OR IGNORE INTO project_guests (project_id, user_id) SELECT id, ? FROM projects WHERE id = ?', row.id, id);
      });
      guestScope.forget(row.id);
      lostAccess.user(row.id);
      hub.presenceChanged();
    }
    // Lets someone who joined by holding NOX stay without the balance check.
    if (req.body.keepWithoutNox === true) sql.run("UPDATE users SET joined_via = 'invite' WHERE id = ? AND joined_via = 'holder'", row.id);
    if ('deactivated' in req.body) {
      const off = Boolean(req.body.deactivated);
      // coming back takes a seat again, so access can't be switched off before paying for fewer seats and on after
      if (!off && row.deactivated) seatGate(sql.get('SELECT role FROM users WHERE id = ?', row.id).role);
      sql.run('UPDATE users SET deactivated = ? WHERE id = ?', off ? 1 : 0, row.id);
      if (off) voterGroups.leave(row.id);
      else voterGroups.join(row.id);
      if (off) {
        sessions.revokeAll(row.id);
        hub.disconnect(row.id);
        if (isAdminRole(sql.get('SELECT role FROM users WHERE id = ?', row.id).role)) adminLeft(row.id, req.user.id);
        else revokeInvitesBy(row.id);
      }
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
