import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import bountyOverview from '../services/bountyOverview.js';
import recordPayment from '../services/recordPayment.js';
import verifyPayment from '../services/verifyPayment.js';
import treasury from '../services/treasury.js';
import toPayment from '../mappers/toPayment.js';

const router = express.Router();
const payment = (id) => toPayment(sql.get('SELECT * FROM payments WHERE id = ?', id));

router.get('/bounties', route((req) => bountyOverview(req.user)));

router.post(
  '/tasks/:id/payments',
  requireAdmin,
  route(async (req) => ({ payment: payment(await recordPayment(req.user, req.params.id, req.body?.txHash)) })),
);

router.post(
  '/payments/:id/check',
  requireAdmin,
  route(async (req) => {
    if (!payment(req.params.id)) throw HttpError.notFound('That payment');
    await verifyPayment(req.params.id);
    return { payment: payment(req.params.id) };
  }),
);

// Only failed attempts can be cleared away; confirmed payments are part of the record.
router.delete(
  '/payments/:id',
  requireAdmin,
  route((req) => {
    const { changes } = sql.run("DELETE FROM payments WHERE id = ? AND status = 'failed'", req.params.id);
    if (!changes) throw HttpError.badRequest('Only failed payments can be removed.');
    return { ok: true };
  }),
);

router.put('/bounties/treasury', requireAdmin, route((req) => ({ treasury: treasury.set(req.body?.addresses) })));

export default router;
