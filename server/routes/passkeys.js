import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import challenges from '../auth/challenges.js';
import relyingParty from '../auth/relyingParty.js';
import passkeys from '../auth/passkeys.js';
import currentUser from '../auth/currentUser.js';
import signIn from '../auth/signIn.js';
import tokenHash from '../auth/tokenHash.js';
import liveInvite from '../services/liveInvite.js';
import createAccount from '../services/createAccount.js';
import addCredential from '../services/addCredential.js';
import publishUser from '../services/publishUser.js';

const router = express.Router();
router.use('/auth/passkey', rateLimit({ windowMs: 15 * 60_000, max: 60 }));

router.post(
  '/auth/passkey/login/options',
  route(async (req) => {
    const rp = relyingParty(req);
    const options = await passkeys.authenticationOptions({ rp });
    return { challengeId: challenges.issue('passkey-login', { challenge: options.challenge }), options };
  }),
);

router.post(
  '/auth/passkey/login',
  route(async (req, res) => {
    const pending = challenges.take(req.body.challengeId, 'passkey-login');
    if (!pending) throw HttpError.badRequest('That sign-in attempt expired. Try again.');
    const response = req.body.response;
    const row = typeof response?.id === 'string' && sql.get("SELECT c.*, u.deactivated FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'passkey' AND c.external_id = ?", response.id);
    if (!row || row.deactivated) throw new HttpError(401, 'That passkey isn’t linked to an active account here.');
    const counter = await passkeys.verifyAuthentication({ rp: relyingParty(req), response, expectedChallenge: pending.challenge, row });
    sql.run('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?', counter, Date.now(), row.id);
    return signIn(req, res, row.user_id);
  }),
);

// mode: 'setup' (first owner), 'invite' (joining) or 'add' (signed-in person adding a passkey)
router.post(
  '/auth/passkey/register/options',
  route(async (req) => {
    const rp = relyingParty(req);
    const { mode } = req.body;
    let pending;
    if (mode === 'add') {
      const user = currentUser(req);
      if (!user) throw new HttpError(401, 'Sign in first.');
      const exclude = sql.all("SELECT * FROM credentials WHERE user_id = ? AND kind = 'passkey'", user.id);
      pending = { mode, userId: user.id, userName: user.name, exclude };
    } else if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      pending = { mode, userId: newId(), userName: check.text(req.body.name, 'Name', { min: 1, max: 80 }), workspaceName: check.text(req.body.workspaceName || 'NONOS', 'Workspace name', { min: 1, max: 60 }) };
    } else if (mode === 'invite') {
      const invite = liveInvite(req.body.inviteToken);
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      pending = { mode, userId: newId(), userName: check.text(req.body.name, 'Name', { min: 1, max: 80 }), inviteHash: invite.token_hash };
    } else {
      throw HttpError.badRequest('Unknown passkey request.');
    }
    const options = await passkeys.registrationOptions({ rp, userId: pending.userId, userName: pending.userName, exclude: pending.exclude });
    delete pending.exclude;
    return { challengeId: challenges.issue('passkey-register', { ...pending, challenge: options.challenge }), options };
  }),
);

router.post(
  '/auth/passkey/register',
  route(async (req, res) => {
    const pending = challenges.take(req.body.challengeId, 'passkey-register');
    if (!pending) throw HttpError.badRequest('That passkey request expired. Try again.');
    const verified = await passkeys.verifyRegistration({ rp: relyingParty(req), response: req.body.response, expectedChallenge: pending.challenge });
    const credential = { kind: 'passkey', externalId: verified.id, publicKey: verified.publicKey, counter: verified.counter, transports: verified.transports, label: check.text(req.body.label, 'Name', { max: 60 }) || 'Passkey' };

    if (pending.mode === 'add') {
      const user = currentUser(req);
      if (!user || user.id !== pending.userId) throw new HttpError(401, 'Sign in again to add a passkey.');
      addCredential(user.id, credential);
      return { ok: true };
    }
    const id = createAccount({ mode: pending.mode, id: pending.userId, name: pending.userName, workspaceName: pending.workspaceName, inviteHash: pending.inviteHash, credential });
    if (pending.mode === 'invite') publishUser(id);
    return signIn(req, res, id);
  }),
);

export default router;
