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

const router = express.Router();

function target(req) {
  const row = sql.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!row) throw HttpError.notFound('That person');
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
      sql.run('UPDATE users SET role = ? WHERE id = ?', role, row.id);
      hub.setAdmin(row.id, role !== 'member');
    }
    if ('deactivated' in req.body) {
      const off = Boolean(req.body.deactivated);
      sql.run('UPDATE users SET deactivated = ? WHERE id = ?', off ? 1 : 0, row.id);
      if (off) {
        sessions.revokeAll(row.id);
        hub.disconnect(row.id);
      }
    }
    return { user: toUser(publishUser(row.id), req.viewer) };
  }),
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
