import express from 'express';
import route from '../lib/route.js';
import rateLimit from '../auth/rateLimit.js';
import liveReset from '../services/liveReset.js';
import publicWorkspace from '../services/publicWorkspace.js';

const router = express.Router();

// What a sign-in reset link's page shows before anyone signs: whose account it opens and where.
// The wallet steps themselves go through /auth/wallet with mode "reset".
router.get(
  '/auth/reset/:token',
  rateLimit({ windowMs: 15 * 60_000, max: 40 }),
  route((req) => {
    const reset = liveReset(req.params.token);
    return reset ? { valid: true, name: reset.name, workspace: publicWorkspace() } : { valid: false };
  }),
);

export default router;
