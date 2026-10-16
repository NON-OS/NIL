import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import plan from '../services/plan.js';
import guestScope from '../services/guestScope.js';
import quote from '../billing/quote.js';
import createInvoice from '../billing/createInvoice.js';
import invoiceView from '../billing/invoiceView.js';
import nameTransaction from '../billing/nameTransaction.js';
import cancelInvoice from '../billing/cancelInvoice.js';
import retryInvoice from '../billing/retryInvoice.js';
import creditBalance from '../billing/creditBalance.js';
import revenue from '../billing/revenue.js';
import watchInvoices from '../jobs/watchInvoices.js';

const router = express.Router();
const perAdmin = (max, windowMs = 60_000) => rateLimit({ windowMs, max, key: (req) => `plan:${req.user.id}`, message: 'Too many billing requests at once. Wait a minute.' });
const reads = perAdmin(60);
const writes = perAdmin(60);

function invoiceOr404(id) {
  const view = invoiceView(id);
  if (!view) throw HttpError.notFound('That invoice');
  return { invoice: view, plan: plan.status() };
}

function enforced() {
  if (!plan.status().enforced) throw HttpError.badRequest('This server runs in community mode: everything is already unlocked.');
}

router.get('/plan', route((req) => (guestScope.of(req.user.id) ? { unlocked: plan.status().unlocked } : plan.status())));

// The price as it would be invoiced right now, shown before anyone pays.
router.get(
  '/plan/quote',
  requireAdmin,
  reads,
  route(async (req) => {
    const q = await quote({ kind: req.query.kind || 'periods', periods: req.query.periods ?? 1, people: req.query.people });
    return { ...q, staked: String(q.staked), tokens: q.tokens.map((t) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals, rate: String(t.rate), rateSource: t.rateSource, usd: t.usd, minimum: String(t.minimum) })) };
  }),
);

router.get(
  '/plan/invoices',
  requireAdmin,
  route(() => ({
    invoices: sql.all('SELECT id FROM billing_invoices ORDER BY number DESC LIMIT 50').map((r) => invoiceView(r.id)),
    credit: creditBalance(),
    plan: plan.status(),
  })),
);

router.post(
  '/plan/invoices',
  requireAdmin,
  writes,
  route(async (req) => {
    enforced();
    const id = await createInvoice(req.user, { kind: req.body?.kind || 'periods', periods: req.body?.periods ?? 1, people: req.body?.people });
    return invoiceOr404(id);
  }),
);

router.get('/plan/invoices/:id', requireAdmin, reads, route((req) => invoiceOr404(req.params.id)));

// The transaction that pays an invoice, from the browser wallet that just sent it or pasted
// from anywhere else. Naming it twice is harmless.
router.post(
  '/plan/invoices/:id/transactions',
  requireAdmin,
  writes,
  route(async (req) => {
    enforced();
    await nameTransaction(req.params.id, req.body?.txHash);
    await watchInvoices().catch(() => {});
    return invoiceOr404(req.params.id);
  }),
);

router.post(
  '/plan/invoices/:id/check',
  requireAdmin,
  writes,
  route(async (req) => {
    invoiceOr404(req.params.id);
    await watchInvoices();
    return invoiceOr404(req.params.id);
  }),
);

router.post(
  '/plan/invoices/:id/cancel',
  requireAdmin,
  writes,
  route((req) => {
    cancelInvoice(req.params.id);
    return invoiceOr404(req.params.id);
  }),
);

router.post(
  '/plan/invoices/:id/retry',
  requireAdmin,
  writes,
  route(async (req) => {
    enforced();
    return invoiceOr404(await retryInvoice(req.user, req.params.id));
  }),
);

router.get('/plan/revenue', requireAdmin, route(() => revenue()));

export default router;
