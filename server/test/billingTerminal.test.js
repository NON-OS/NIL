import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Every state a Nil Pro invoice, a Nil Pro payment or a bounty payment can be in, and how each one
// that isn't final gets out of it by itself: by the clock, or as soon as the chain says so. Along
// the way the node misbehaves on purpose: down for hours or days, refusing calls, reorganising.
const INVOICE = { open: 'moves', paid: 'final', expired: 'final', cancelled: 'final' };
// dropped is final; the reconciliation still looks for it for PLAN_RECONCILE_DAYS
const PAYMENT = { seen: 'moves', confirming: 'moves', final: 'final', failed: 'final', unmatched: 'final', dropped: 'final' };
// a cancelled bounty payment is watched for PAYMENT_WATCH_DAYS, then left alone
const BOUNTY = { pending: 'moves', cancelled: 'moves', confirmed: 'final', failed: 'final' };

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let sql;
let billingState;
let watchInvoices;
let checkPayments;
const chain = mockChain();
const owner = client(() => srv.base);
const member = client(() => srv.base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_INVOICES_PER_DAY: '40' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: checkPayments } = await import('../jobs/checkPayments.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

// Moves everything billing remembers `hours` into the past, as if that much time went by.
function age(hours) {
  const ms = hours * HOUR;
  sql.run('UPDATE billing_invoices SET created_at = created_at - ?, expires_at = expires_at - ?', ms, ms);
  sql.run('UPDATE billing_payments SET created_at = created_at - ?', ms);
  sql.run('UPDATE payments SET created_at = created_at - ?, cancelled_at = cancelled_at - ?', ms, ms);
  for (const key of ['watchedAt', 'reconciledAt']) {
    const at = billingState.get(key, null);
    if (at !== null) billingState.set(key, at - ms);
  }
}
// The node down altogether, as a load balancer with nothing behind it answers.
const down = () => chain.refuse(() => true, { status: 503, error: { code: -32603, message: 'Service unavailable' } });
const run = () => watchInvoices().catch(() => {});
const credit = async () => (await owner('GET', '/api/plan/invoices')).data.credit;
// enough $10 periods that the credit earlier tests left behind never pays the whole invoice
const create = async () => (await owner('POST', '/api/plan/invoices', { periods: 2 + Math.ceil((await credit()) / 10_000_000) })).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const usdc = (invoice) => invoice.amounts.find((a) => a.symbol === 'USDC').amount;
const row = (hash) => sql.get('SELECT status, on_time FROM billing_payments WHERE tx_hash = ?', hash);

test('every status the billing and bounty code writes is one this walk covers', () => {
  const files = [...fs.readdirSync(new URL('../billing/', import.meta.url)).map((f) => `../billing/${f}`), ...['verifyPayment', 'failPayment', 'settlePayment', 'cancelPayment', 'recordPayment', 'refreshBountyState', 'bountyLocked', 'startPayment'].map((f) => `../services/${f}.js`), '../jobs/checkPayments.js'];
  const found = new Set();
  for (const file of files) {
    const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const [, list] of text.matchAll(/status\s+IN\s*\(([^)]*)\)/g)) for (const [, s] of list.matchAll(/'([a-z_]+)'/g)) found.add(s);
    for (const [, s] of text.matchAll(/status\s*(?:={1,3}|!==?)\s*'([a-z_]+)'/g)) found.add(s);
  }
  const known = new Set([...Object.keys(INVOICE), ...Object.keys(PAYMENT), ...Object.keys(BOUNTY)]);
  assert.deepEqual([...found].filter((s) => !known.has(s)), [], 'a new state needs its way out shown here');
  assert.ok(found.has('confirming') && found.has('pending') && found.has('open'));
});

test('an open invoice with a named transaction expires by the clock while the node is down for a day, and the payment still counts once it turns up', async () => {
  const invoice = await create();
  const hash = tx();
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash })).data.invoice.state, 'seen');
  const lift = down();
  try {
    await run();
    assert.equal(row(hash).status, 'seen', 'an hour of outage changes nothing');
    age(25);
    await run();
    assert.equal(row(hash).status, 'dropped', 'NOX_MISSING_TX_HOURS passed: given up on without the node');
    assert.equal((await view(invoice.id)).status, 'expired');
  } finally {
    lift();
  }
  // mined after all: the reconciliation finds it, and it becomes credit since its invoice closed
  const before = await credit();
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  await run();
  chain.mine(3);
  await run();
  assert.deepEqual({ ...row(hash) }, { status: 'final', on_time: 0 });
  assert.ok((await credit()) > before);
});

test('a confirming payment is given up on after PLAN_LATE_DAYS of outage, then found again and counted', async () => {
  const invoice = await create();
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  await run();
  assert.equal(row(hash).status, 'confirming');
  const lift = down();
  try {
    age(6 * 24);
    await run();
    assert.equal(row(hash).status, 'confirming', 'six days of outage: still waiting');
    age(2 * 24);
    await run();
    assert.equal(row(hash).status, 'dropped');
    assert.equal((await view(invoice.id)).status, 'expired');
  } finally {
    lift();
  }
  chain.mine(3);
  await run();
  assert.equal(row(hash).status, 'final', 'the reconciliation picked it up again');
});

test('refused receipts keep a payment waiting where it is, and it settles once they are answered', async () => {
  const invoice = await create();
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  await run();
  const lift = chain.refuse((method, params) => method === 'eth_getTransactionReceipt' && params[0] === hash);
  try {
    chain.mine(3);
    age(3);
    await run();
    const waiting = sql.get('SELECT status, block_hash FROM billing_payments WHERE tx_hash = ?', hash);
    assert.equal(waiting.status, 'confirming');
    assert.ok(waiting.block_hash, 'nothing about it was forgotten');
  } finally {
    lift();
  }
  await run();
  assert.equal((await view(invoice.id)).status, 'paid');
});

test('a node that lags far behind on finality keeps payments waiting, and they settle when it catches up', async () => {
  const invoice = await create();
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  chain.setFinalityLag(500);
  try {
    chain.mine(20);
    await run();
    assert.equal(row(hash).status, 'confirming');
    assert.equal((await view(invoice.id)).state, 'confirming');
  } finally {
    chain.setFinalityLag(2);
  }
  await run();
  assert.equal((await view(invoice.id)).status, 'paid');
});

test('a reorg that takes a payment away for good lets its invoice expire by the clock', async () => {
  const invoice = await create();
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  await run();
  chain.drop(hash);
  await run();
  assert.equal((await view(invoice.id)).state, 'waiting');
  age(8 * 24);
  await run();
  assert.equal(row(hash).status, 'dropped');
  assert.equal((await view(invoice.id)).status, 'expired');
});

test('bounty payments: pending waits out an outage and then settles; cancelled is watched for a while, then left alone', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Outage work', assigneeId: ids.member, bounty: String(10n ** 18n) })).data.task;
  const intent = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent;
  const hash = tx();
  const lift = down();
  let pending;
  try {
    pending = (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash })).data.payment;
    age(30);
    await checkPayments();
    assert.equal(sql.get('SELECT status FROM payments WHERE id = ?', pending.id).status, 'pending', 'a node that is down never fails a payment');
  } finally {
    lift();
  }
  await checkPayments();
  assert.equal(sql.get('SELECT status FROM payments WHERE id = ?', pending.id).status, 'failed', 'once the node answers, a transaction that never showed up fails');

  // a stuck payment, cancelled, whose transaction lands only after PAYMENT_WATCH_DAYS
  const again = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent;
  const late = tx();
  const stuck = (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: again.id, txHash: late })).data.payment;
  assert.equal((await owner('POST', `/api/payments/${stuck.id}/cancel`)).status, 200);
  age(8 * 24);
  chain.addTransferAt({ hash: late, token: NOX, from: ownerWallet.address, to: again.to, value: again.amount, atBlock: chain.head() + 1 });
  chain.mine(4);
  await checkPayments();
  assert.equal(sql.get('SELECT status FROM payments WHERE id = ?', stuck.id).status, 'cancelled');
});
