import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const HISTORY = 1000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let watchInvoices;
let sql;
const chain = mockChain();
const owner = client(() => srv.base);

before(async () => {
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_LOG_BLOCKS: '200', NOX_LOG_HISTORY_BLOCKS: String(HISTORY) },
  });
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: sql } = await import('../db/sql.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

const create = async () => (await owner('POST', '/api/plan/invoices', {})).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const amount = (invoice, symbol) => invoice.amounts.find((a) => a.symbol === symbol).amount;
const pay = (token, value) => chain.addTransfer({ hash: tx(), token, from: wallet().address, to: TREASURY, value: String(value), depth: 1 });
const cancelOpen = () => sql.run("UPDATE billing_invoices SET status = 'cancelled', closed_at = ? WHERE status = 'open'", Date.now());
// the public node answers eth_getLogs for blocks older than its window with HTTP 403
const oldLogsRefused = () => chain.refuse((method, params) => method === 'eth_getLogs' && Number(params[0].fromBlock) < chain.head() - HISTORY);

test('a scan that fell further behind than the node keeps logs skips those blocks, says so, and finds later payments', async () => {
  const invoice = await create();
  await watchInvoices();
  const lift = oldLogsRefused();
  try {
    // the server was down for longer than the node keeps logs
    chain.mine(3000);
    await watchInvoices();
    const gaps = (await view(invoice.id)).missedBlocks;
    assert.deepEqual(gaps.map((g) => g.symbol).sort(), ['NOX', 'USDC']);
    for (const gap of gaps) {
      assert.ok(gap.from <= invoice.startBlock + 1, `the gap starts where the scan stopped (${gap.from})`);
      assert.ok(gap.to < chain.head() - HISTORY + 100 && gap.to > chain.head() - HISTORY, `the gap ends inside the node's window (${gap.to})`);
    }

    pay(USDC, amount(invoice, 'USDC'));
    chain.mine(3);
    await watchInvoices();
    const paid = await view(invoice.id);
    assert.equal(paid.status, 'paid');
    assert.deepEqual(paid.missedBlocks, []);
  } finally {
    lift();
  }
});

test('one token the node won’t scan doesn’t hold up the other, nor payments already found', async () => {
  cancelOpen();
  const invoice = await create();
  const lift = chain.refuse((method, params) => method === 'eth_getLogs' && params[0].address.toLowerCase() === USDC);
  try {
    pay(NOX, amount(invoice, 'NOX'));
    chain.mine(3);
    // the refusal is passed on, in the node's own words, after everything else has run
    await assert.rejects(watchInvoices(), /refused \(HTTP 403\): Archive requests require a personal token/);
    assert.equal((await view(invoice.id)).status, 'paid');
  } finally {
    lift();
  }
});
