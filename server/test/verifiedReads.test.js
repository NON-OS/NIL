import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import smartWallet from './helpers/smartWallet.js';
import socket from './helpers/socket.js';
import testVerifier from './helpers/testVerifier.js';
import verifierProxy from './helpers/verifierProxy.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const UNIT = 10n ** 18n;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

const chain = mockChain();
let v;
let proxy;
let srv;
let sql;
let checkPayments;
let watchInvoices;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  chain.server.listen(0);
  await once(chain.server, 'listening');
  const nodeUrl = `http://127.0.0.1:${chain.server.address().port}`;
  v = await testVerifier(nodeUrl);
  proxy = await verifierProxy(v.url, nodeUrl, testVerifier.KEY);
  srv = await startServer({
    env: { NOX_RPC_URL: proxy.url, NOX_VERIFIER_MODE: 'enforce', NOX_VERIFIER_KEY: testVerifier.KEY, NOX_MISSING_TX_HOURS: '1', PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_NOX_USD: '0.05', PLAN_LOG_BLOCKS: '200' },
  });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: checkPayments } = await import('../jobs/checkPayments.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Jane Doe', inviteToken: inv.data.token })).data.user.id;
});
after(async () => {
  srv.close();
  proxy.close();
  await v.close();
  chain.server.close();
});

const verification = async () => (await owner('GET', '/api/bootstrap')).data.nox.verification;
const payment = (id) => sql.get('SELECT status, problem FROM payments WHERE id = ?', id);
// A bounty payment the owner recorded for `hash`, whatever the chain says about it. `mode` is
// how the app reaches its verifier from the moment the payment is recorded.
async function recorded(hash, { send = true, mode = 'through' } = {}) {
  const t = (await owner('POST', '/api/tasks', { title: 'Bounty work', assigneeId: ids.member, bounty: (10n * UNIT).toString() })).data.task;
  const intent = (await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).data.intent;
  chain.mine(2);
  if (send) chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: intent.to, value: intent.amount, depth: 1 });
  chain.mine(4);
  proxy.set(mode);
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash });
  return res.data.payment ?? sql.get('SELECT id FROM payments WHERE tx_hash = ?', hash);
}
// a proven read, so the notice clears again for the next test
const recover = async () => {
  proxy.set('through');
  v.client.lies = () => false;
  v.client.fails = () => null;
  await checkPayments();
};

test('a real payment, proven by the verifier, settles; only admins see the verification state', async () => {
  const p = await recorded(tx());
  assert.equal(p.state, 'paid');
  const state = await verification();
  assert.equal(state.mode, 'enforce');
  assert.equal(state.required, true);
  assert.equal(state.ok, true);
  assert.equal((await member('GET', '/api/bootstrap')).data.nox.verification, undefined);
});

test('a lying node’s receipt for a payment that never happened is never credited, and admins are told', async () => {
  const fake = tx();
  const live = await socket(srv.base, owner.cookie());
  v.client.lies = (method, params) => method === 'eth_getTransactionReceipt' && params[0] === fake;
  try {
    const p = await recorded(fake);
    assert.equal(p.state, 'sent');
    await checkPayments();
    assert.equal(payment(p.id).status, 'pending');
    const state = await verification();
    assert.equal(state.ok, false);
    assert.equal(state.reason, 'mismatch');
    const event = live.events.find((e) => e.type === 'verification');
    assert.equal(event?.verification.reason, 'mismatch');
    const check = await owner('POST', `/api/payments/${p.id}/check`);
    assert.equal(check.status, 503);
    assert.match(check.data.error, /didn’t match the chain/);
  } finally {
    live.close();
    await recover();
  }
  // true answers since then don't make the lie go away: the notice keeps it for a day
  const after = await verification();
  assert.equal(after.reason, 'mismatch');
  assert.ok(after.mismatchAt);
  const { default: verifyHealth } = await import('../chain/verifyHealth.js');
  assert.equal(verifyHealth.report(Date.now() + 25 * 3_600_000).ok, true);
});

test('a lying node’s Transfer log never pays a Nil Pro invoice', async () => {
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const usdc = invoice.amounts.find((a) => a.symbol === 'USDC').amount;
  const hash = tx();
  chain.addTransfer({ hash, token: USDC, from: wallet().address, to: TREASURY, value: usdc, depth: 1 });
  chain.mine(4);
  v.client.lies = (method, params, result) => (method === 'eth_getLogs' && result?.length > 0) || (method === 'eth_getTransactionReceipt' && params[0] === hash);
  try {
    await watchInvoices().catch(() => {});
    assert.equal((await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice.status, 'open');
    assert.equal(sql.get('SELECT COUNT(*) AS n FROM billing_payments WHERE tx_hash = ?', hash).n, 0);
    assert.equal((await verification()).reason, 'mismatch');
  } finally {
    await recover();
  }
  // once the answers check out, the same transfer pays it
  await watchInvoices();
  assert.equal((await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice.status, 'paid');
});

test('a lying node’s balance neither opens the holder door nor turns anyone away, and no vote opens on it', async () => {
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (1000n * UNIT).toString() })).status, 200);
  const whale = wallet();
  chain.setBalance(whale.address, 5000n * UNIT);
  v.client.lies = (method) => method === 'eth_call';
  try {
    // an error, never a "not enough": the door neither opens nor shuts on it
    const join = await client(base).wallet(whale, 'holder', { name: 'Whale' });
    assert.ok(join.status >= 500, `got ${join.status}`);
    const vote = await owner('POST', '/api/proposals', { title: 'Fund the grants round', options: ['Fund', 'Wait'], weighting: 'power' });
    assert.notEqual(vote.status, 200);
    assert.equal(sql.get('SELECT COUNT(*) AS n FROM proposal_power').n, 0);
  } finally {
    await recover();
  }
  assert.equal((await client(base).wallet(whale, 'holder', { name: 'Whale' })).status, 200);
});

test('a smart wallet whose signature can’t be verified is neither signed in nor turned away', async () => {
  const w = smartWallet();
  chain.addSmartWallet(w);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  v.client.lies = (method, params) => method === 'eth_call' && params[0].to === w.address;
  try {
    const refused = await client(base).wallet(w, 'invite', { name: 'Safe', inviteToken: inv.data.token });
    assert.equal(refused.status, 503);
    assert.match(refused.data.error, /couldn’t be verified/);
  } finally {
    await recover();
  }
  assert.equal((await client(base).wallet(w, 'invite', { name: 'Safe', inviteToken: inv.data.token })).status, 200);
});

test('an answer that went around the verifier, carries a forged seal, or is sealed as merely relayed, counts for nothing', async () => {
  for (const mode of ['direct', 'forged', 'relabelled']) {
    const p = await recorded(tx(), { mode });
    try {
      await checkPayments();
      assert.equal(payment(p.id).status, 'pending', mode);
      assert.equal((await verification()).reason, 'unsealed', mode);
    } finally {
      await recover();
    }
    assert.equal(payment(p.id).status, 'confirmed', mode);
  }
});

test('when the verifier is down, or its checkpoint is too old, crediting waits and the notice says why', async () => {
  const p = await recorded(tx(), { mode: 'down' });
  await checkPayments();
  assert.equal(payment(p.id).status, 'pending');
  assert.equal((await verification()).reason, 'unreachable');

  proxy.set('through');
  v.state.phase = 'down';
  v.state.reason = 'checkpoint';
  try {
    await checkPayments();
    assert.equal(payment(p.id).status, 'pending');
    assert.equal((await verification()).reason, 'checkpoint');
    // and the error any admin action hits says so in words
    assert.match((await owner('POST', `/api/payments/${p.id}/check`)).data.error, /checkpoint is too old/);
    assert.equal(payment(p.id).status, 'pending');
    assert.equal((await verification()).reason, 'checkpoint');
  } finally {
    v.state.phase = 'ready';
    v.state.reason = null;
  }
  await recover();
  assert.equal(payment(p.id).status, 'confirmed');
});

test('a transaction the node says doesn’t exist is never failed for it, since absence can’t be proven', async () => {
  const p = await recorded(tx(), { send: false });
  sql.run('UPDATE payments SET created_at = ? WHERE id = ?', Date.now() - 2 * 3_600_000, p.id);
  await checkPayments();
  const row = payment(p.id);
  assert.equal(row.status, 'pending');
  assert.match(row.problem, /if it was never sent, cancel this payment/);
  // the admin who knows it was never sent can still take it off the bounty
  assert.equal((await owner('POST', `/api/payments/${p.id}/cancel`)).data.payment.state, 'cancelled');
});

test('a payment in a block older than the verifier can prove waits, saying so, without raising the alarm', async () => {
  const hash = tx();
  v.client.fails = (method, params) => (method === 'eth_getTransactionReceipt' && params[0] === hash ? new Error('block 1004 is outside EIP-2935 ring buffer range (latest: 9999, buffer size: 8191)') : null);
  try {
    const p = await recorded(hash);
    await checkPayments();
    const row = payment(p.id);
    assert.equal(row.status, 'pending');
    assert.match(row.problem, /older than Nil’s verifier can check/);
    assert.notEqual((await verification()).reason, 'out-of-range');
  } finally {
    await recover();
  }
});

test('a Nil Pro transaction that hasn’t shown up is kept, not dropped, while reads are verified', async () => {
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const hash = tx();
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash })).status, 200);
  sql.run('UPDATE billing_payments SET created_at = ? WHERE tx_hash = ?', Date.now() - 2 * 3_600_000, hash);
  await watchInvoices();
  const row = sql.get('SELECT status, problem FROM billing_payments WHERE tx_hash = ?', hash);
  assert.equal(row.status, 'seen');
  assert.match(row.problem, /keeps watching/);
});
