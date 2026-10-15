import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import password from '../auth/password.js';
import passwordProblem from '../auth/passwordProblem.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import rateLimit from '../auth/rateLimit.js';
import hub from '../realtime/hub.js';
import publishUser from '../services/publishUser.js';
import toUser from '../mappers/toUser.js';

const router = express.Router();
const passwordLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => `pw:${req.user.id}` });

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

// Changing the password signs out every other device. People who joined with a passkey
// or wallet can add an email and password here as a second way in.
router.post(
  '/me/password',
  passwordLimit,
  route((req, res) => {
    const row = sql.get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (row.password_hash && !password.verify(String(req.body.current || ''), row.password_hash)) throw HttpError.badRequest('Your current password is incorrect.');
    const email = row.email ?? check.email(req.body.email);
    if (!row.email && sql.get('SELECT 1 FROM users WHERE email = ?', email)) throw HttpError.badRequest('That email already belongs to another account.');
    const problem = passwordProblem(req.body.next, { email, name: row.name });
    if (problem) throw HttpError.badRequest(problem);
    sql.run('UPDATE users SET password_hash = ?, email = ? WHERE id = ?', password.hash(req.body.next), email, req.user.id);
    sessions.revokeAll(req.user.id);
    hub.disconnect(req.user.id);
    sessionCookie.write(req, res, sessions.create(req.user.id));
    return { ok: true };
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
