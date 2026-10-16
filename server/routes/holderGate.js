import express from 'express';
import route from '../lib/route.js';
import requireAdmin from '../auth/requireAdmin.js';
import holderGate from '../services/holderGate.js';

const router = express.Router();

router.get('/holder-gate', route(() => holderGate.get()));
router.put('/holder-gate', requireAdmin, route((req) => holderGate.set(req.body ?? {})));

export default router;
