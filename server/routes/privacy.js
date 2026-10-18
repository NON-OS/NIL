import express from 'express';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import retention from '../services/retention.js';
import publicWorkspace from '../services/publicWorkspace.js';
import wipeWorkspace from '../services/wipeWorkspace.js';
import purge from '../jobs/purge.js';
import pruneAgentData from '../jobs/pruneAgentData.js';

const router = express.Router();

router.get('/privacy', route(() => ({ retention: retention.get(), allowed: retention.allowed })));

router.patch(
  '/privacy',
  requireAdmin,
  route(async (req) => {
    const next = retention.set(req.body?.retention ?? {});
    await purge();
    await pruneAgentData();
    return { retention: next, allowed: retention.allowed };
  }),
);

// Owner only, and the workspace name must be typed exactly, so it can't happen by accident.
router.post(
  '/privacy/wipe',
  route((req) => {
    if (req.user.role !== 'owner') throw HttpError.forbidden('Only an owner can erase the workspace.');
    if (req.body?.confirm !== publicWorkspace()?.name) throw HttpError.badRequest('Type the workspace name exactly to confirm.');
    wipeWorkspace();
    return { ok: true };
  }),
);

export default router;
