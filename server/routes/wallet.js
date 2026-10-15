import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import challenges from '../auth/challenges.js';
import relyingParty from '../auth/relyingParty.js';
import siwe from '../auth/siwe.js';
import currentUser from '../auth/currentUser.js';
import signIn from '../auth/signIn.js';
import liveInvite from '../services/liveInvite.js';
import createAccount from '../services/createAccount.js';
import addCredential from '../services/addCredential.js';
import publishUser from '../services/publishUser.js';

const router = express.Router();
router.use('/auth/wallet', rateLimit({ windowMs: 15 * 60_000, max: 60 }));

const STATEMENT = {
  login: (ws) => `Sign in to ${ws}.`,
  setup: (ws) => `Create the ${ws} workspace with this wallet.`,
  invite: (ws) => `Join ${ws} with this wallet.`,
  add: (ws) => `Link this wallet to your ${ws} account.`,
};

// Step 1: the server writes the exact message the wallet will sign.
router.post(
  '/auth/wallet/challenge',
  route((req) => {
    const { address, mode } = req.body;
    if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
    if (!STATEMENT[mode]) throw HttpError.badRequest('Unknown wallet request.');
    const rp = relyingParty(req);
    const pending = { mode, address: address.toLowerCase() };

    if (mode === 'add') {
      const user = currentUser(req);
      if (!user) throw new HttpError(401, 'Sign in first.');
      pending.userId = user.id;
    } else if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      pending.name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
      pending.workspaceName = check.text(req.body.workspaceName || 'NONOS', 'Workspace name', { min: 1, max: 60 });
    } else if (mode === 'invite') {
      const invite = liveInvite(req.body.inviteToken);
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      pending.name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
      pending.inviteHash = invite.token_hash;
    }

    const now = new Date();
    pending.message = siwe.message({
      host: rp.host,
      origin: rp.origin,
      address,
      statement: STATEMENT[mode](pending.workspaceName ?? rp.name),
      nonce: crypto.randomBytes(12).toString('hex'),
      chainId: Number.isInteger(req.body.chainId) && req.body.chainId > 0 ? req.body.chainId : 1,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    });
    return { challengeId: challenges.issue('wallet', pending), message: pending.message };
  }),
);

// Step 2: check who signed it, then sign in, sign up or link.
router.post(
  '/auth/wallet/verify',
  route((req, res) => {
    const pending = challenges.take(req.body.challengeId, 'wallet');
    if (!pending) throw HttpError.badRequest('That wallet request expired. Try again.');
    if (siwe.recover(pending.message, req.body.signature) !== pending.address) throw new HttpError(401, 'That signature doesn’t match the wallet.');

    if (pending.mode === 'login') {
      const row = sql.get("SELECT c.id, c.user_id, u.deactivated FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'wallet' AND c.external_id = ?", pending.address);
      if (!row || row.deactivated) throw new HttpError(404, 'No account here uses this wallet. Ask an admin for an invite, then join with your wallet.');
      sql.run('UPDATE credentials SET last_used_at = ? WHERE id = ?', Date.now(), row.id);
      return signIn(req, res, row.user_id);
    }
    if (pending.mode === 'add') {
      const user = currentUser(req);
      if (!user || user.id !== pending.userId) throw new HttpError(401, 'Sign in again to link a wallet.');
      addCredential(user.id, pending.address);
      return { ok: true };
    }
    const id = createAccount({ mode: pending.mode, id: newId(), name: pending.name, workspaceName: pending.workspaceName, inviteHash: pending.inviteHash, address: pending.address });
    if (pending.mode === 'invite') publishUser(id);
    return signIn(req, res, id);
  }),
);

export default router;
