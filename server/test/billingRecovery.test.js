import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// A server without PLAN_INVOICE_SLOT: payments that a lagging node or a reorg makes vanish for a
// while, and transactions an admin names by hash.
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const DAY = 86_400_000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let sql;
let watchInvoices;
let confirmPayments;
const chain = mockChain();
const owner = client(() => srv.base);

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '12', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_INVOICES_PER_DAY: '40' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: confirmPayments } = await import('../billing/confirmPayments.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

const create = async () => (await owner('POST', '/api/plan/invoices', {})).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const usdc = (invoice) => invoice.amounts.find((a) => a.symbol === 'USDC').amount;
const row = (hash) => sql.get('SELECT status, problem, block_number FROM billing_payments WHERE tx_hash = ?', hash);
const send = (hash, value, from = wallet().address) => chain.addTransfer({ hash, token: USDC, from, to: TREASURY, value: String(value), depth: 1 });
const finalize = async () => {
  chain.mine(3);
  await watchInvoices();
};

test('one empty answer for a receipt after finality doesn’t lose the payment', async () => {
  const invoice = await create();
  const hash = tx();
  const payer = wallet().address;
  chain.mine(1);
  send(hash, usdc(invoice), payer);
  await watchInvoices();
  const block = chain.blockOf(hash);
  chain.mine(3);

  // a node behind a load balancer answers null for this receipt, once
  chain.drop(hash);
  await watchInvoices();
  const missing = row(hash);
  assert.deepEqual([missing.status, missing.block_number], ['confirming', null]);
  assert.match(missing.problem, /keeps looking for it/);
  assert.equal((await view(invoice.id)).state, 'waiting', 'it doesn’t count while it isn’t in a block');

  // the node has it again, in the block it was always in, which the scan has already passed
  chain.addTransferAt({ hash, token: USDC, from: payer, to: TREASURY, value: usdc(invoice), atBlock: block });
  chain.mine(1);
  await watchInvoices();
  assert.equal(row(hash).status, 'final');
  assert.equal((await view(invoice.id)).status, 'paid');
});

test('a transfer gone for longer than PLAN_LATE_DAYS is dropped, and naming it again finds it', async () => {
  const invoice = await create();
  const hash = tx();
  const payer = wallet().address;
  chain.mine(1);
  send(hash, usdc(invoice), payer);
  await watchInvoices();
  const block = chain.blockOf(hash);
  chain.drop(hash);
  await confirmPayments(Date.now() + 8 * DAY);
  assert.equal(row(hash).status, 'dropped');
  await finalize();
  assert.equal(row(hash).status, 'dropped');

  // back in its old block, long final, which the scan never reads again
  chain.addTransferAt({ hash, token: USDC, from: payer, to: TREASURY, value: usdc(invoice), atBlock: block });
  await finalize();
  assert.equal(row(hash).status, 'dropped');
  const named = await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash });
  assert.equal(named.status, 200);
  assert.equal(row(hash).status, 'final');
  assert.equal(named.data.invoice.status, 'paid');
});

test('a receipt the node refuses for one payment doesn’t hold up the others', async () => {
  const first = await create();
  const second = await create();
  const stuck = tx();
  const fine = tx();
  chain.mine(1);
  send(stuck, usdc(first));
  send(fine, usdc(second));
  const lift = chain.refuse((method, params) => method === 'eth_getTransactionReceipt' && params[0] === stuck);
  try {
    await finalize();
    assert.equal((await view(second.id)).status, 'paid');
    assert.equal((await view(first.id)).state, 'confirming');
  } finally {
    lift();
  }
  await watchInvoices();
  assert.equal((await view(first.id)).status, 'paid');
});
