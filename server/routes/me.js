import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import hub from '../realtime/hub.js';
import publishUser from '../services/publishUser.js';
import toUser from '../mappers/toUser.js';

const router = express.Router();

router.patch(
  '/me',
  route((req) => {
    const b = req.body;
    if ('name' in b) sql.run('UPDATE users SET name = ? WHERE id = ?', check.text(b.name, 'Name', { min: 1, max: 80 }), req.user.id);
    if ('title' in b) sql.run('UPDATE users SET title = ? WHERE id = ?', check.text(b.title, 'Role', { max: 80 }), req.user.id);
    if ('color' in b) sql.run('UPDATE users SET color = ? WHERE id = ?', check.color(b.color), req.user.id);
    const row = publishUser(req.user.id);
    return { user: toUser(row, req.viewer) };
  }),
);

router.post(
  '/me/sign-out-everywhere',
  route((req, res) => {
    sessions.revokeAll(req.user.id);
    hub.disconnect(req.user.id);
    sessionCookie.clear(req, res);
    return { ok: true };
  }),
);

export default router;
