import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import plan from '../services/plan.js';
import verifyPlanPayment from '../services/verifyPlanPayment.js';
import guestScope from '../services/guestScope.js';

const router = express.Router();
const TX = /^0x[0-9a-f]{64}$/;

const toPayment = (r) => ({ id: r.id, txHash: r.tx_hash, status: r.status, problem: r.problem, amount: r.amount, periods: r.periods, createdAt: r.created_at, confirmedAt: r.confirmed_at });

router.get('/plan', route((req) => (guestScope.of(req.user.id) ? { unlocked: plan.status().unlocked } : plan.status())));
router.get('/plan/payments', requireAdmin, route(() => sql.all('SELECT * FROM plan_payments ORDER BY created_at DESC LIMIT 100').map(toPayment)));

// An admin's wallet sends NOX to the treasury; the transaction hash comes here to be checked.
router.post(
  '/plan/payments',
  requireAdmin,
  route(async (req) => {
    if (!plan.status().enforced) throw HttpError.badRequest('This server runs in community mode: everything is already unlocked.');
    const hash = String(req.body?.txHash ?? '').trim().toLowerCase();
    if (!TX.test(hash)) throw HttpError.badRequest('That doesn’t look like a transaction hash.');
    if (sql.get('SELECT 1 FROM plan_payments WHERE tx_hash = ?', hash) || sql.get('SELECT 1 FROM payments WHERE tx_hash = ?', hash)) throw new HttpError(409, 'That transaction was already recorded.');
    const id = newId();
    sql.run('INSERT INTO plan_payments (id, payer_id, tx_hash, created_at) VALUES (?, ?, ?, ?)', id, req.user.id, hash, Date.now());
    try {
      await verifyPlanPayment(id);
    } catch {
      // the node hiccuped; the background check will retry
    }
    return { payment: toPayment(sql.get('SELECT * FROM plan_payments WHERE id = ?', id)), plan: plan.status() };
  }),
);

router.post(
  '/plan/payments/:id/check',
  requireAdmin,
  route(async (req) => {
    await verifyPlanPayment(req.params.id);
    const row = sql.get('SELECT * FROM plan_payments WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That payment');
    return { payment: toPayment(row), plan: plan.status() };
  }),
);

export default router;
