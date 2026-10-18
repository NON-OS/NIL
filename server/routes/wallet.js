import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import walletChallenges from '../auth/walletChallenges.js';
import clientKey from '../auth/clientKey.js';
import relyingParty from '../auth/relyingParty.js';
import siwe from '../auth/siwe.js';
import walletSignature from '../auth/walletSignature.js';
import currentUser from '../auth/currentUser.js';
import signIn from '../auth/signIn.js';
import setupToken from '../auth/setupToken.js';
import confirmedSession from '../auth/confirmedSession.js';
import sessionCookie from '../auth/sessionCookie.js';
import tokenHash from '../auth/tokenHash.js';
import config from '../config.js';
import liveInvite from '../services/liveInvite.js';
import createAccount from '../services/createAccount.js';
import addCredential from '../services/addCredential.js';
import liveReset from '../services/liveReset.js';
import useSignInReset from '../services/useSignInReset.js';
import signInAudit from '../services/signInAudit.js';
import publishUser from '../services/publishUser.js';
import holderGate from '../services/holderGate.js';
import holderWallets from '../services/holderWallets.js';
import holderSignIn from '../services/holderSignIn.js';
import checkHolderJoin from '../services/checkHolderJoin.js';
import recheckHolders from '../services/recheckHolders.js';

const router = express.Router();
router.use('/auth/wallet', rateLimit({ windowMs: 15 * 60_000, max: 60 }));

const STATEMENT = {
  login: (ws) => `Sign in to ${ws}.`,
  setup: (ws) => `Create the ${ws} workspace with this wallet.`,
  invite: (ws) => `Join ${ws} with this wallet.`,
  holder: (ws) => `Join ${ws} as a NOX holder with this wallet.`,
  add: (ws) => `Link this wallet to your ${ws} account.`,
  reset: (ws) => `Link this wallet to your ${ws} account and sign in.`,
  confirm: (ws) => `Confirm it’s you, to link another wallet or make an access key for your ${ws} account.`,
};

const linked = (userId, address) => Boolean(sql.get("SELECT 1 FROM credentials WHERE user_id = ? AND kind = 'wallet' AND external_id = ?", userId, address));

// Step 1: the server writes the exact message the wallet will sign.
router.post(
  '/auth/wallet/challenge',
  route((req) => {
    const { address, mode } = req.body;
    if (!siwe.isAddress(address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
    // own keys only: "constructor" or "toString" would otherwise pass as a mode
    if (typeof mode !== 'string' || !Object.hasOwn(STATEMENT, mode)) throw HttpError.badRequest('Unknown wallet request.');
    const rp = relyingParty(req);
    const pending = { mode, address: address.toLowerCase() };

    if (mode === 'add' || mode === 'confirm') {
      const user = currentUser(req);
      if (!user) throw new HttpError(401, 'Sign in first.');
      pending.userId = user.id;
      // a borrowed session alone can't add a way back in: a linked wallet has to say so first
      if (mode === 'add') confirmedSession(req);
      if (mode === 'confirm' && !linked(user.id, pending.address)) throw HttpError.badRequest('That wallet isn’t linked to your account. Switch to one that is, then try again.');
    } else if (mode === 'setup') {
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This workspace is already set up. Sign in instead.');
      setupToken.check(req.body.setupToken);
      pending.name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
      pending.workspaceName = check.text(req.body.workspaceName || 'My team', 'Workspace name', { min: 1, max: 60 });
      // only an explicit "everyday team" hides the crypto tools; older clients and scripts keep them
      pending.cryptoTools = req.body.cryptoTools !== false;
    } else if (mode === 'invite') {
      const invite = liveInvite(req.body.inviteToken);
      if (!invite) throw HttpError.badRequest('This invite link has expired or was already used. Ask for a new one.');
      pending.name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
      pending.inviteHash = invite.token_hash;
    } else if (mode === 'holder') {
      if (!holderGate.get().enabled) throw HttpError.forbidden('This workspace is invite-only.');
      holderWallets.checkFree(pending.address);
      pending.name = check.text(req.body.name, 'Name', { min: 1, max: 80 });
    } else if (mode === 'reset') {
      const reset = liveReset(req.body.resetToken);
      if (!reset) throw HttpError.badRequest('This sign-in reset link has expired or was already used. Ask your admin for a new one.');
      pending.resetId = reset.id;
    }

    const now = new Date();
    pending.message = siwe.message({
      host: rp.host,
      origin: rp.origin,
      address,
      // a workspace can have an empty name, and "Sign in to ." helps nobody
      // a name with line breaks in it could add lines that look like the message's own fields
      statement: STATEMENT[mode]((pending.workspaceName ?? rp.name ?? '').replace(/\s+/g, ' ').trim() || 'Nil'),
      nonce: crypto.randomBytes(12).toString('hex'),
      chainId: Number.isSafeInteger(req.body.chainId) && req.body.chainId > 0 ? req.body.chainId : 1,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    });
    return { challengeId: walletChallenges.issue('wallet', pending, clientKey(req.ip)), message: pending.message };
  }),
);

// Step 2: check who signed it, then sign in, sign up or link.
router.post(
  '/auth/wallet/verify',
  route(async (req, res) => {
    // a challenge is checked before the signature, so a smart wallet's on-chain check only ever
    // follows one this client was given, and both sit behind the rate limit above
    const pending = walletChallenges.take(req.body.challengeId, 'wallet', clientKey(req.ip));
    if (!pending) throw HttpError.badRequest('That wallet request expired. Try again.');
    await walletSignature(pending.address, pending.message, req.body.signature);

    if (pending.mode === 'login') {
      const row = sql.get("SELECT c.id, c.user_id, u.deactivated, u.joined_via, u.kind FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'wallet' AND c.external_id = ?", pending.address);
      if (!row && sql.get("SELECT 1 FROM applications WHERE address = ? AND status = 'pending'", pending.address)) {
        throw HttpError.forbidden('Your bounty application is still waiting for the team. Sign in here again once they accept it.');
      }
      if (!row || row.deactivated || row.kind !== 'human') throw new HttpError(404, 'No account here uses this wallet. Ask an admin for an invite, then join with your wallet.');
      const gate = holderGate.get();
      if (row.joined_via === 'holder' && gate.enabled) await holderSignIn(row.user_id, gate);
      sql.run('UPDATE credentials SET last_used_at = ? WHERE id = ?', Date.now(), row.id);
      return signIn(req, res, row.user_id);
    }
    if (pending.mode === 'add' || pending.mode === 'confirm') {
      const user = currentUser(req);
      if (!user || user.id !== pending.userId) throw new HttpError(401, 'Sign in again to link a wallet.');
      if (pending.mode === 'confirm') {
        if (!linked(user.id, pending.address)) throw HttpError.badRequest('That wallet isn’t linked to your account any more.');
        const now = Date.now();
        sql.run('UPDATE sessions SET confirmed_at = ? WHERE token_hash = ?', now, tokenHash(sessionCookie.read(req)));
        return { ok: true, until: now + config.signIn.confirmMs };
      }
      confirmedSession(req);
      addCredential(user.id, pending.address);
      signInAudit('wallet.linked', { actorId: user.id, subjectId: user.id });
      return { ok: true };
    }
    if (pending.mode === 'reset') return signIn(req, res, useSignInReset(pending.resetId, pending.address));
    if (pending.mode === 'holder') await checkHolderJoin(pending.address);
    // only these three make an account; anything else reaching here is a bug, never a sign-up
    if (!['setup', 'invite', 'holder'].includes(pending.mode)) throw HttpError.badRequest('Unknown wallet request.');
    const id = createAccount({ mode: pending.mode, id: newId(), name: pending.name, workspaceName: pending.workspaceName, cryptoTools: pending.cryptoTools, inviteHash: pending.inviteHash, address: pending.address });
    if (pending.mode === 'setup') setupToken.discard();
    else publishUser(id);
    // the NOX that just let this wallet in may have come from another member's wallet; a burst
    // of joins shares one pass (see recheckHolders)
    if (pending.mode === 'holder') recheckHolders({ force: true }).catch(() => {});
    return signIn(req, res, id);
  }),
);

export default router;
