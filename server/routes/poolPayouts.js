import express from 'express';
import config from '../config.js';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import assetPool from '../pools/assetPool.js';
import poolIntent from '../pools/poolIntent.js';
import relayQuote from '../pools/relayQuote.js';
import relayPayout from '../pools/relayPayout.js';
import findPayout from '../pools/findPayout.js';
import toPayment from '../mappers/toPayment.js';

const router = express.Router();
const relays = rateLimit({ windowMs: 60_000, max: 20, key: (req) => `pool-relay:${req.user.id}`, message: 'Too many pool payouts at once. Wait a minute.' });
const off = (req, res, next) => (config.pools.enabled ? next() : res.status(404).json({ error: 'Private pool payouts are off on this server.' }));
const payment = (id) => (id ? toPayment(sql.get('SELECT * FROM payments WHERE id = ?', id)) : null);

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
// straight away. `recovered` says the relayer reported a problem and Nil found the withdrawal
// on-chain anyway.
router.post(
  '/pool-payouts/:intentId/relay',
  requireAdmin,
  off,
  relays,
  route(async (req) => {
    const { id, recovered } = await relayPayout(req.user, poolIntent(req.user, req.params.intentId), req.body);
    return { payment: payment(id), recovered };
  }),
);

// Check for the payout: looks on-chain for one handed to the relayer that the browser never
// heard back about, and records it for the same payout. `payment` is null while there's none.
router.post(
  '/pool-payouts/:intentId/find',
  requireAdmin,
  off,
  relays,
  route(async (req) => ({ payment: payment(await findPayout(req.user, req.params.intentId)) })),
);

export default router;
