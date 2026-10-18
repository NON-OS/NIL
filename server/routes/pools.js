import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import headBlock from '../chain/headBlock.js';
import assetPool from '../pools/assetPool.js';
import poolSets from '../pools/poolSets.js';
import poolLogs from '../pools/poolLogs.js';
import poolAbi from '../pools/poolAbi.js';
import poolReceipt from '../pools/poolReceipt.js';
import reviewStatuses from '../pools/reviewStatuses.js';

const router = express.Router();
const perAdmin = (name, max) => rateLimit({ windowMs: 60_000, max, key: (req) => `pools:${name}:${req.user.id}`, message: 'Too many pool requests at once. Wait a minute.' });
const reads = perAdmin('reads', 120);
const scans = perAdmin('scans', 600);
const text = (v) => (typeof v === 'bigint' ? v.toString() : v);

// Only admins pay bounties, so only admins reach any of this; members never learn the team
// uses a pool from these routes.
router.use('/pools', requireAdmin, (req, res, next) => {
  if (!config.pools.enabled) return res.status(404).json({ error: 'Private pool payouts are off on this server.' });
  next();
});

// The network, the entry contract and each reward token's pool, or why a token has none.
router.get(
  '/pools',
  reads,
  route(async () => {
    const assets = [];
    for (const a of config.pools.assets) {
      const found = await assetPool.get(a.symbol);
      assets.push(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, text(v)])));
    }
    return { network: config.pools.network, chainId: config.pools.chainId, entrypoint: config.pools.entrypoint, extraGas: config.pools.extraGas, head: await headBlock(), logRangeBlocks: config.pools.logRangeBlocks, assets };
  }),
);

router.get(
  '/pools/:symbol/sets',
  reads,
  route(async (req) => poolSets(await assetPool.usable(req.params.symbol))),
);

router.post(
  '/pools/:symbol/review',
  reads,
  route(async (req) => ({ statuses: await reviewStatuses(await assetPool.usable(req.params.symbol), req.body?.labels) })),
);

// The pool events in one transaction, for noting down a deposit or ragequit this browser sent.
router.get(
  '/pools/receipts/:txHash',
  reads,
  route(async (req) => {
    const found = await poolReceipt(req.params.txHash);
    if (found.state === 'invalid') throw HttpError.badRequest('That doesn’t look like a transaction hash.');
    return found;
  }),
);

// One block range of a pool's deposits, withdrawals and ragequits, every team's alike, for a
// browser rebuilding the team's notes from the chain.
router.post(
  '/pools/:symbol/events',
  scans,
  route(async (req) => {
    const found = await assetPool.get(req.params.symbol);
    if (!found.pool) throw new HttpError(409, found.problem);
    const from = Number(req.body?.fromBlock);
    const to = Number(req.body?.toBlock);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from >= config.pools.logRangeBlocks) {
      throw HttpError.badRequest(`Ask for at most ${config.pools.logRangeBlocks} blocks at a time.`);
    }
    return { events: await poolLogs(found.pool, [poolAbi.deposited, poolAbi.withdrawn, poolAbi.ragequit], from, to) };
  }),
);

export default router;
