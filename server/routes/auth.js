import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import tokenHash from '../auth/tokenHash.js';
import hub from '../realtime/hub.js';
import currentUser from '../auth/currentUser.js';
import rateLimit from '../auth/rateLimit.js';
import liveInvite from '../services/liveInvite.js';
import publicWorkspace from '../services/publicWorkspace.js';
import holderGate from '../services/holderGate.js';
import config from '../config.js';

const router = express.Router();
const perIp = rateLimit({ windowMs: 15 * 60_000, max: 40 });

router.get(
  '/auth/state',
  route((req) => ({
    needsSetup: !sql.get('SELECT 1 FROM users LIMIT 1'),
    user: currentUser(req),
    workspace: publicWorkspace(),
    holderGate: holderGate.get().enabled ? { minimum: holderGate.get().minimum, symbol: config.nox.symbol, decimals: config.nox.decimals } : null,
    // read here at runtime, so the web build stays the same on every server
    walletConnect: config.walletConnect.enabled ? { projectId: config.walletConnect.projectId, relayUrl: config.walletConnect.relayUrl, chainId: config.nox.chainId } : null,
  })),
);

router.post(
  '/auth/logout',
  route((req, res) => {
    const token = sessionCookie.read(req);
    sessions.revoke(token);
    // the live connection opened with this session would otherwise keep streaming updates
    if (token) hub.endSession(tokenHash(token));
    sessionCookie.clear(req, res);
    return { ok: true };
  }),
);

router.get(
  '/auth/invite/:token',
  perIp,
  route((req) => (liveInvite(req.params.token) ? { valid: true, workspace: publicWorkspace() } : { valid: false })),
);

export default router;
