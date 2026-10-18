import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// A hosted server: workspace 3 of 10 on a shared treasury. Its suffixes come from its own
// share, so under- and overpayments from any wallet can be matched to it with certainty.
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const KEY = 'shared-hosting-secret-0123456789';
const DAY = 86_400_000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let sql;
let watchInvoices;
let permute;
let pickSuffix;
const chain = mockChain();
const owner = client(() => srv.base);

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_INVOICE_SLOT: '3/10', PLAN_INVOICE_KEY: KEY } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: permute } = await import('../billing/permute.js'));
  ({ default: pickSuffix } = await import('../billing/pickSuffix.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

const create = async (body = {}) => (await owner('POST', '/api/plan/invoices', body)).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const usdc = (invoice) => invoice.amounts.find((a) => a.symbol === 'USDC');
const pay = (value) => chain.addTransfer({ hash: tx(), token: USDC, from: wallet().address, to: TREASURY, value: String(value), depth: 1 });
const finalize = async () => {
  chain.mine(3);
  await watchInvoices();
};
const shares = new Map();
const share = (index) => {
  if (!shares.has(index)) shares.set(index, new Set(Array.from({ length: 999 }, (_, r) => permute(1 + index * 999 + r, 4, KEY))));
  return shares.get(index);
};

test('the keyed shuffle is a bijection, so the workspaces’ shares of suffixes never overlap', () => {
  // every three-digit suffix maps to a different three-digit suffix
  const seen = new Set();
  for (let x = 1; x < 1000; x++) {
    const s = permute(x, 3, KEY);
    assert.ok(s >= 1 && s < 1000);
    seen.add(s);
  }
  assert.equal(seen.size, 999);
  const mine = share(3);
  const next = share(4);
  assert.equal([...mine].filter((s) => next.has(s)).length, 0);
  // a different key shuffles differently, so suffixes don't reveal the slot to outsiders
  assert.notDeepEqual(Array.from({ length: 20 }, (_, i) => permute(i + 1, 4, KEY)), Array.from({ length: 20 }, (_, i) => permute(i + 1, 4, 'another-secret-key-0123456789')));
});

test('a suffix is always drawn from this server’s share and skips the ones in use', () => {
  const slot = { index: 3, count: 10 };
  const mine = share(3);
  const taken = new Set();
  for (let i = 0; i < 50; i++) {
    const s = pickSuffix(taken, { digits: 4, slot, key: KEY });
    assert.ok(mine.has(s));
    assert.ok(!taken.has(s));
    taken.add(s);
  }
  // once the share is full there is nothing left to hand out
  const full = new Set(mine);
  assert.equal(pickSuffix(full, { digits: 4, slot, key: KEY }), null);
  // without a key the share is a plain range
  assert.equal(pickSuffix(new Set(), { digits: 4, slot, key: null }, () => 0), 1 + 3 * 999);
});

test('invoices made here carry suffixes from this server’s share', async () => {
  const invoice = await create();
  assert.ok(share(3).has(Number(BigInt(usdc(invoice).amount) % 10_000n)));
});

test('an underpayment from any wallet is matched, shows the exact shortfall, and a top-up finishes it', async () => {
  const invoice = await create();
  const exact = BigInt(usdc(invoice).amount);
  chain.mine(1);
  // an exchange that took a $1.00 fee out of the amount
  pay(exact - 1_000_000n);
  await finalize();
  const short = await view(invoice.id);
  assert.equal(short.state, 'underpaid');
  const a = usdc(short);
  assert.equal(a.shortfall, '1000000');
  // the top-up asks for the dollar, with the invoice's suffix so it matches this invoice too
  assert.equal(BigInt(a.ask), 1_000_000n + (exact % 10_000n));
  assert.match(a.link, new RegExp(`uint256=${a.ask}$`));
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);

  pay(BigInt(a.ask));
  await watchInvoices();
  assert.equal((await view(invoice.id)).state, 'confirming');
  await finalize();
  const done = await view(invoice.id);
  assert.equal(done.state, 'paid', 'the suffix on the top-up is less than a cent over');
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, true);
});

test('an overpayment is credited pro rata as extra time, never lost', async () => {
  const before = (await owner('GET', '/api/plan')).data.paidUntil;
  const invoice = await create();
  const exact = BigInt(usdc(invoice).amount);
  chain.mine(1);
  pay(exact + 5_000_000n);
  await finalize();
  const paid = await view(invoice.id);
  assert.equal(paid.state, 'overpaid');
  assert.ok(Math.abs(paid.overpaidUsd - 5_000_000) < 10_000);
  // $15 for a $10 period buys a period and a half
  assert.ok(Math.abs(paid.grantedDays - 45) < 0.05, String(paid.grantedDays));
  const after = (await owner('GET', '/api/plan')).data.paidUntil;
  assert.ok(Math.abs(after - before - 45 * DAY) < 0.05 * DAY);
});

test('a second payment to an invoice already paid also counts as extra time', async () => {
  const invoice = await create();
  const exact = BigInt(usdc(invoice).amount);
  chain.mine(1);
  pay(exact);
  await finalize();
  assert.equal((await view(invoice.id)).grantedDays, 30);
  pay(exact);
  await finalize();
  const twice = await view(invoice.id);
  assert.equal(twice.state, 'overpaid');
  assert.ok(Math.abs(twice.grantedDays - 60) < 0.01);
});

test('a transfer with another workspace’s suffix is ignored, whatever its amount', async () => {
  const invoice = await create();
  const exact = BigInt(usdc(invoice).amount);
  const foreign = [...share(4)][0];
  chain.mine(1);
  pay(exact - (exact % 10_000n) + BigInt(foreign));
  await finalize();
  assert.equal((await view(invoice.id)).state, 'waiting');
});

test('a reorg that moves a payment to another place in its block keeps one payment, and it settles', async () => {
  const invoice = await create();
  const exact = BigInt(usdc(invoice).amount);
  // about half, with the invoice's suffix
  const half = exact - (exact / 2n / 10_000n) * 10_000n;
  const payer = wallet().address;
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: payer, to: TREASURY, value: String(half), depth: 1 });
  await watchInvoices();
  const rows = () => sql.all('SELECT log_index, status FROM billing_payments WHERE tx_hash = ?', hash).map((r) => [r.log_index, r.status]);
  assert.deepEqual(rows(), [[0, 'confirming']]);

  // mined again a block later, behind another transfer, so its log moves from 0 to 1
  chain.mine(1);
  chain.reorg(chain.blockOf(hash));
  chain.addTransfers({ hash, depth: 1, transfers: [{ token: USDC, from: payer, to: wallet().address, value: '5' }, { token: USDC, from: payer, to: TREASURY, value: String(half) }] });
  await watchInvoices();
  assert.deepEqual(rows(), [[1, 'confirming']]);
  await finalize();
  assert.deepEqual(rows(), [[1, 'final']]);

  const settled = await view(invoice.id);
  assert.equal(settled.state, 'underpaid');
  assert.equal(usdc(settled).received, String(half), 'counted once');
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/cancel`)).status, 200);
});
