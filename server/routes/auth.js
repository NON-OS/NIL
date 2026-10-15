import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import password from '../auth/password.js';
import passwordProblem from '../auth/passwordProblem.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import currentUser from '../auth/currentUser.js';
import rateLimit from '../auth/rateLimit.js';
import signIn from '../auth/signIn.js';
import liveInvite from '../services/liveInvite.js';
import createAccount from '../services/createAccount.js';
import publicWorkspace from '../services/publicWorkspace.js';
import publishUser from '../services/publishUser.js';

const router = express.Router();
const perIp = rateLimit({ windowMs: 15 * 60_000, max: 40 });
const perEmail = rateLimit({ windowMs: 15 * 60_000, max: 8, key: (req) => `email:${String(req.body?.email || '').toLowerCase()}` });

function credentials(body) {
  const name = check.text(body.name, 'Name', { min: 1, max: 80 });
  const email = check.email(body.email);
  const problem = passwordProblem(body.password, { email, name });
  if (problem) throw HttpError.badRequest(problem);
  return { name, email, passwordHash: password.hash(body.password) };
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
    const workspaceName = check.text(req.body.workspaceName || 'NONOS', 'Workspace name', { min: 1, max: 60 });
    const id = createAccount({ mode: 'setup', workspaceName, ...credentials(req.body) });
    return signIn(req, res, id);
  }),
);

router.post(
  '/auth/login',
  perIp,
  perEmail,
  route((req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const row = email ? sql.get('SELECT * FROM users WHERE email = ?', email) : null;
    // verify() runs against a dummy hash when there's no row or no password, so timing reveals nothing
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
    const id = createAccount({ mode: 'invite', inviteHash: invite.token_hash, ...credentials(req.body) });
    publishUser(id);
    return signIn(req, res, id);
  }),
);

export default router;
