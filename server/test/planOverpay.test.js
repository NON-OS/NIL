import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const TREASURY = '0x7777777777777777777777777777777777777777';
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let billingState;
let watchInvoices;
let sql;
const chain = mockChain();
const owner = client(() => srv.base);

// a hosted-style server with its own slot, where any amount ending in an invoice's suffix counts
before(async () => {
  srv = await startServer({
    chain,
    env: {
      PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '12', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_MAX_PERIODS: '24', PLAN_PERIOD_DAYS: '30',
      PLAN_SUFFIX_DIGITS: '6', PLAN_INVOICE_SLOT: '3/1000', PLAN_INVOICE_KEY: 'k'.repeat(64), PLAN_INVOICES_PER_DAY: '40',
    },
  });
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: sql } = await import('../db/sql.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Owner', workspaceName: 'Overpay' });
});
after(() => srv.close());

const create = async (body = {}) => {
  const res = await owner('POST', '/api/plan/invoices', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.invoice;
};
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const amount = (inv, symbol) => BigInt(inv.amounts.find((a) => a.symbol === symbol).amount);
const send = async (token, value) => {
  chain.mine(1);
  chain.addTransfer({ hash: tx(), token, from: wallet().address, to: TREASURY, value: String(value), depth: 1 });
  chain.mine(3);
  await watchInvoices();
};
const credit = async () => (await import('../billing/creditBalance.js')).default();
// lets each test start from no plan and no credit
const fresh = () => {
  billingState.set('plan', {});
  sql.run("UPDATE billing_invoices SET status = 'cancelled' WHERE status = 'open'");
  sql.run('DELETE FROM billing_payments');
  sql.run('DELETE FROM billing_amounts');
  sql.run('DELETE FROM billing_invoices');
};

test('a huge overpayment buys at most the longest plan, and the rest becomes credit', async () => {
  fresh();
  const invoice = await create({ periods: 1 });
  const asked = amount(invoice, 'USDC');
  // $1,188 more than asked, keeping the suffix
  const sent = asked + 1188n * 10n ** 6n;
  await send(USDC, sent);
  const v = await view(invoice.id);
  assert.equal(v.grantedDays, 24 * 30, 'capped at PLAN_MAX_PERIODS periods');
  // 24 periods at the amount asked (a little over $12, since it rounds up and carries the
  // suffix) are time; the rest of what arrived is credit, in micro-USD like USDC's units
  const left = await credit();
  assert.ok(Math.abs(left - Number(sent - 24n * asked)) <= 2, `credit ${left}, expected ${sent - 24n * asked}`);
});

test('NOX sent beyond the cap is credit at the lower of the locked rate and today’s', async () => {
  fresh();
  const invoice = await create({ periods: 1 });
  const asked = amount(invoice, 'NOX');
  const grid = 10n ** 16n;
  // as if the rate had been locked at twice today's: NOX fell after the invoice was made
  sql.run('UPDATE billing_amounts SET rate = ? WHERE invoice_id = ? AND token = ?', String(2n * 5n * 10n ** 16n), invoice.id, NOX);
  // fifty times the amount asked
  await send(NOX, asked + ((asked * 49n) / grid) * grid);
  const v = await view(invoice.id);
  assert.equal(v.grantedDays, 24 * 30);
  // $9.60 of NOX was asked at $0.05, so 192 NOX; about 26 × 192 NOX lie beyond the cap, worth
  // about $250 at today's $0.05 and twice that at the locked rate
  const left = await credit();
  assert.ok(left > 240_000_000 && left < 260_000_000, `credit ${left}`);
});

test('paying exactly still buys exactly the periods on the invoice', async () => {
  fresh();
  const invoice = await create({ periods: 3 });
  await send(USDC, amount(invoice, 'USDC'));
  const v = await view(invoice.id);
  assert.equal(v.state, 'paid');
  assert.equal(v.grantedDays, 90);
  assert.equal(await credit(), 0);
});
