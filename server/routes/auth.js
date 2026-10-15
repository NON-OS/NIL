import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import password from '../auth/password.js';
import passwordProblem from '../auth/passwordProblem.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import currentUser from '../auth/currentUser.js';
import rateLimit from '../auth/rateLimit.js';
import tokenHash from '../auth/tokenHash.js';
import publicWorkspace from '../services/publicWorkspace.js';
import publishUser from '../services/publishUser.js';
import toUser from '../mappers/toUser.js';

const router = express.Router();
const perIp = rateLimit({ windowMs: 15 * 60_000, max: 40 });
const perEmail = rateLimit({ windowMs: 15 * 60_000, max: 8, key: (req) => `email:${String(req.body?.email || '').toLowerCase()}` });

const randomColor = () => domain.colors[Math.floor(Math.random() * domain.colors.length)];

function credentials(body) {
  const name = check.text(body.name, 'Name', { min: 1, max: 80 });
  const email = check.email(body.email);
  const problem = passwordProblem(body.password, { email, name });
  if (problem) throw HttpError.badRequest(problem);
  return { name, email, plain: body.password };
}

function signIn(req, res, userId) {
  sessionCookie.write(req, res, sessions.create(userId));
  const row = sql.get('SELECT * FROM users WHERE id = ?', userId);
  return { user: toUser(row, { id: userId }) };
}

function liveInvite(token) {
  const row = sql.get('SELECT * FROM invites WHERE token_hash = ?', tokenHash(token));
  return row && !row.used_at && row.expires_at > Date.now() ? row : null;
}

router.get(
  '/auth/state',
  route((req) => ({
    needsSetup: !sql.get('SELECT 1 FROM users LIMIT 1'),
    user: currentUser(req),
    workspace: publicWorkspace(),
  })),
);

router.post(
  '/auth/setup',
  perIp,
  route((req, res) => {
    const { name, email, plain } = credentials(req.body);
    const workspaceName = check.text(req.body.workspaceName || 'NONOS', 'Workspace name', { min: 1, max: 60 });
    const prefix = (workspaceName.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'NON').slice(0, 3);
    const id = newId();
    sql.tx(() => {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      sql.run('INSERT INTO workspace (id, name, task_prefix, created_at) VALUES (1, ?, ?, ?)', workspaceName, prefix, Date.now());
      sql.run(
        'INSERT INTO users (id, email, name, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, email, name, password.hash(plain), 'owner', randomColor(), Date.now(),
      );
    });
    return signIn(req, res, id);
  }),
);

router.post(
  '/auth/login',
  perIp,
  perEmail,
  route((req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const row = sql.get('SELECT * FROM users WHERE email = ?', email);
    // verify() runs against a dummy hash when the row is missing, so timing doesn't reveal accounts
    const ok = password.verify(String(req.body.password || ''), row?.password_hash);
    if (!row || !ok || row.deactivated) throw new HttpError(401, 'That email and password don’t match an active account.');
    return signIn(req, res, row.id);
  }),
);

router.post(
  '/auth/logout',
  route((req, res) => {
    sessions.revoke(sessionCookie.read(req));
    sessionCookie.clear(req, res);
    return { ok: true };
  }),
);

router.get(
  '/auth/invite/:token',
  perIp,
  route((req) => {
    const row = liveInvite(req.params.token);
    return row ? { valid: true, email: row.email, workspace: publicWorkspace() } : { valid: false };
  }),
);

router.post(
  '/auth/accept-invite',
  perIp,
  route((req, res) => {
    const invite = liveInvite(String(req.body.token || ''));
    if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
    const { name, email, plain } = credentials(req.body);
    if (invite.email && invite.email !== email) throw HttpError.badRequest('This invite was sent to a different email address.');
    if (sql.get('SELECT 1 FROM users WHERE email = ?', email)) throw HttpError.badRequest('That email already has an account here. Sign in instead.');

    const id = newId();
    sql.tx(() => {
      sql.run(
        'INSERT INTO users (id, email, name, password_hash, role, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, email, name, password.hash(plain), invite.role === 'admin' ? 'admin' : 'member', randomColor(), Date.now(),
      );
      sql.run('UPDATE invites SET used_by = ?, used_at = ? WHERE token_hash = ?', id, Date.now(), invite.token_hash);
    });
    publishUser(id);
    return signIn(req, res, id);
  }),
);

export default router;
