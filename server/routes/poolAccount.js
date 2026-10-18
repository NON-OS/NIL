import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import headBlock from '../chain/headBlock.js';
import poolAccount from '../services/poolAccount.js';

const router = express.Router();
const writes = rateLimit({ windowMs: 60_000, max: 60, key: (req) => `pool-account:${req.user.id}`, message: 'Too many changes to the pool notes at once. Wait a minute.' });
const off = (req, res, next) => (config.pools.enabled ? next() : res.status(404).json({ error: 'Private pool payouts are off on this server.' }));

// The team's pool account: the key sealed to you, if you hold it, and the team's encrypted
// notes. Everything here was sealed or encrypted in an admin's browser.
router.get('/pool-account', requireAdmin, off, route((req) => ({ account: poolAccount.view(req.user.id) })));

router.post(
  '/pool-account',
  requireAdmin,
  off,
  writes,
  route(async (req) => ({ account: poolAccount.create(req.user.id, req.body ?? {}, await headBlock()) })),
);

router.put('/pool-account/keys', requireAdmin, off, writes, route((req) => ({ account: poolAccount.grant(req.user.id, req.body?.grants) })));

router.put('/pool-account/notes', requireAdmin, off, writes, route((req) => ({ account: poolAccount.saveNotes(req.user.id, req.body ?? {}) })));

export default router;
