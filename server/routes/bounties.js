import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import bountyOverview from '../services/bountyOverview.js';
import startPayment from '../services/startPayment.js';
import recordPayment from '../services/recordPayment.js';
import verifyPayment from '../services/verifyPayment.js';
import cancelPayment from '../services/cancelPayment.js';
import treasury from '../services/treasury.js';
import toPayment from '../mappers/toPayment.js';

const router = express.Router();
const payment = (id) => toPayment(sql.get('SELECT * FROM payments WHERE id = ?', id));
const perAdmin = (max) => rateLimit({ windowMs: 60_000, max, key: (req) => `payments:${req.user.id}`, message: 'Too many payment requests at once. Wait a minute.' });
const writes = perAdmin(60);
const checks = perAdmin(120);

router.get('/bounties', route((req) => bountyOverview(req.user)));

// Step 1: Nil says exactly what to send and where. A private payout sends the one-time key here.
router.post(
  '/tasks/:id/payments/intent',
  requireAdmin,
  writes,
  route(async (req) => ({ intent: await startPayment(req.user, req.params.id, req.body?.stealth ?? null) })),
);

// Step 2: the transaction that sent it, from the browser wallet or pasted from a multisig.
router.post(
  '/tasks/:id/payments',
  requireAdmin,
  writes,
  route(async (req) => ({ payment: payment(await recordPayment(req.user, req.params.id, { intentId: req.body?.intentId, txHash: req.body?.txHash, announceTx: req.body?.announceTx })) })),
);

router.post(
  '/payments/:id/check',
  requireAdmin,
  checks,
  route(async (req) => {
    if (!payment(req.params.id)) throw HttpError.notFound('That payment');
    await verifyPayment(req.params.id);
    return { payment: payment(req.params.id) };
  }),
);

// A payment whose transaction never made it into a block can be taken off the bounty and paid
// again; it's still watched in case the transaction lands after all.
router.post(
  '/payments/:id/cancel',
  requireAdmin,
  writes,
  route(async (req) => {
    await cancelPayment(req.params.id);
    return { payment: payment(req.params.id) };
  }),
);

// Only failed attempts can be cleared away. Confirmed payments are part of the record, and a
// cancelled one stays so its transaction is still counted if it lands.
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
