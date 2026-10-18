import express from 'express';
import config from '../config.js';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import assetPool from '../pools/assetPool.js';
import poolIntent from '../pools/poolIntent.js';
import relayQuote from '../pools/relayQuote.js';
import relayWithdrawal from '../pools/relayWithdrawal.js';
import recordPayment from '../services/recordPayment.js';
import toPayment from '../mappers/toPayment.js';

const router = express.Router();
const relays = rateLimit({ windowMs: 60_000, max: 20, key: (req) => `pool-relay:${req.user.id}`, message: 'Too many pool payouts at once. Wait a minute.' });
const off = (req, res, next) => (config.pools.enabled ? next() : res.status(404).json({ error: 'Private pool payouts are off on this server.' }));

// The relayer's signed price for one pool payout Nil started, for the admin to see before
// anything is proven or sent.
router.post(
  '/pool-payouts/:intentId/quote',
  requireAdmin,
  off,
  relays,
  route(async (req) => {
    const { intent } = poolIntent(req.user, req.params.intentId);
    return { quote: await relayQuote(intent, await assetPool.usable(intent.token)) };
  }),
);

// Sends a proven withdrawal through the relayer and records its transaction as the payment
// straight away, so a closed tab can't lose track of money that moved.
router.post(
  '/pool-payouts/:intentId/relay',
  requireAdmin,
  off,
  relays,
  route(async (req) => {
    const { intent, task } = poolIntent(req.user, req.params.intentId);
    const txHash = await relayWithdrawal(intent, await assetPool.usable(intent.token), req.body);
    const id = await recordPayment(req.user, task.id, { intentId: intent.id, txHash });
    return { payment: toPayment(sql.get('SELECT * FROM payments WHERE id = ?', id)) };
  }),
);

export default router;
