import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// The safety nets around Nil Pro billing: the reconciliation that goes over the recent past again,
// the watchdog that never lets a stall pass in silence, and prices that never fail a quote. NOX is
// priced from a pool here, with no manual rate to fall back on.
const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const POOL = '0x1111111111111111111111111111111111111111';
const STAKING = '0xa94d6009790ba13597a1e1b7cf4e1531ea513613';
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
const TREASURY = '0x7777777777777777777777777777777777777777';
const HOUR = 3_600_000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let sql;
let billingState;
let watchInvoices;
let watchBilling;
const chain = mockChain();
const owner = client(() => srv.base);
const member = client(() => srv.base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_POOL: POOL, PLAN_INVOICES_PER_DAY: '40' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: watchBilling } = await import('../jobs/watchBilling.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const run = () => watchInvoices().catch(() => {});
const create = async () => (await owner('POST', '/api/plan/invoices', {})).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const usdc = (invoice) => invoice.amounts.find((a) => a.symbol === 'USDC').amount;
const notices = async (who) => (await who('GET', '/api/notifications')).data.filter((n) => n.type === 'billing_stalled');
const healthz = async () => (await (await fetch(`${srv.base}/healthz`)).json()).billing.stalled;
const age = (hours) => {
  const ms = hours * HOUR;
  sql.run('UPDATE billing_payments SET created_at = created_at - ?', ms);
  sql.run('UPDATE payments SET created_at = created_at - ?', ms);
  billingState.set('watchedAt', billingState.get('watchedAt', Date.now()) - ms);
};

test('NOX that can’t be priced is offered as unavailable while USDC works, and a reverting contract never fails a quote', async () => {
  chain.breakContract(POOL);
  chain.breakContract(STAKING);
  chain.breakContract(ZSP);
  try {
    const q = await owner('GET', '/api/plan/quote');
    assert.equal(q.status, 200);
    assert.deepEqual(q.data.tokens.map((t) => t.symbol), ['USDC']);
    const made = await owner('POST', '/api/plan/invoices', {});
    assert.equal(made.status, 200, made.data.error);
    assert.deepEqual(made.data.invoice.amounts.map((a) => a.symbol), ['USDC']);
    sql.run("UPDATE billing_invoices SET status = 'cancelled' WHERE id = ?", made.data.invoice.id);
  } finally {
    chain.fixContract(POOL);
    chain.fixContract(STAKING);
    chain.fixContract(ZSP);
  }
});

test('the reconciliation finds a transfer the minute-by-minute scan passed over', async () => {
  const invoice = await create();
  const hash = tx();
  chain.mine(1);
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  chain.mine(3);
  // a node that answered the scan's log query short: the cursor has moved past the transfer
  billingState.set('scan', { [USDC]: chain.head(), [NOX]: chain.head() });
  billingState.set('reconciledAt', Date.now());
  await run();
  assert.equal((await view(invoice.id)).state, 'waiting');

  billingState.set('reconciledAt', Date.now() - 61 * 60_000);
  await run();
  await run();
  assert.equal((await view(invoice.id)).status, 'paid');
  // running it again changes nothing
  billingState.set('reconciledAt', Date.now() - 61 * 60_000);
  await run();
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM billing_payments WHERE tx_hash = ?', hash).n, 1);
});

test('a stall is told to the admins once and listed for the operator, and forgotten once things move again', async () => {
  await run();
  assert.deepEqual(watchBilling(), []);
  const invoice = await create();
  chain.mine(1);
  chain.addTransfer({ hash: tx(), token: USDC, from: wallet().address, to: TREASURY, value: usdc(invoice), depth: 1 });
  const task = (await owner('POST', '/api/tasks', { title: 'Stuck work', assigneeId: ids.member, bounty: String(10n ** 18n) })).data.task;
  const intent = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent;
  const bountyHash = tx();
  chain.mine(1);
  chain.addTransfer({ hash: bountyHash, token: NOX, from: ownerWallet.address, to: intent.to, value: intent.amount, depth: 1 });

  // the node stops reporting finality, then goes down altogether, for hours
  chain.setFinalityLag(1000);
  await run();
  await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: bountyHash });
  const lift = chain.refuse(() => true, { status: 503, error: { code: -32603, message: 'Service unavailable' } });
  try {
    await run();
    age(7);
    const codes = watchBilling().map((s) => s.code).sort();
    assert.deepEqual(codes, ['bounty_pending', 'payments_final_wait', 'watch_failing']);
    const mine = await notices(owner);
    assert.equal(mine.length, 3);
    assert.ok(mine.every((n) => n.data.text.length > 40), 'each says what is happening and what Nil does');
    assert.match(mine.find((n) => n.data.code === 'watch_failing').data.text, /Nothing is lost/);
    assert.equal((await notices(member)).length, 0, 'only admins hear about billing');
    assert.deepEqual((await healthz()).sort(), codes);
    watchBilling();
    assert.equal((await notices(owner)).length, 3, 'told once, not every run');
  } finally {
    lift();
    chain.setFinalityLag(2);
  }
  chain.mine(3);
  await run();
  await owner('POST', `/api/payments/${sql.get('SELECT id FROM payments WHERE tx_hash = ?', bountyHash).id}/check`);
  assert.deepEqual(watchBilling(), []);
  assert.deepEqual(await healthz(), []);
  assert.equal((await view(invoice.id)).status, 'paid');
});
