import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const TREASURY = '0x7777777777777777777777777777777777777777';
const UNIT = 10n ** 18n;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
// what arrives of `amount` when NOX keeps `bps`, rounded down like the contract
const net = (amount, bps = 100) => BigInt(amount) - (BigInt(amount) * BigInt(bps)) / 10_000n;
// a transfer of `amount` the way NOX makes it while it keeps a fee: what's left goes to `to`, and
// the fee goes from the same sender to the token contract, in the same transaction
const charged = ({ hash = tx(), from, to, amount, bps = 100, depth = 1 }) => {
  chain.addTransfers({ hash, depth, transfers: [{ token: NOX, from, to: NOX, value: String(BigInt(amount) - net(amount, bps)) }, { token: NOX, from, to, value: String(net(amount, bps)) }] });
  return hash;
};

let srv;
let checkTransferFee;
let watchInvoices;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_NOX_USD: '0.05' } });
  ({ default: checkTransferFee } = await import('../jobs/checkTransferFee.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const feeShown = async () => (await owner('GET', '/api/bootstrap')).data.nox.transferFeeBps;
const bounty = async (title) => {
  const task = (await owner('POST', '/api/tasks', { title, assigneeId: ids.member, bounty: String(100n * UNIT) })).data.task;
  return { task, intent: (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent };
};
const record = async ({ task, intent }, hash) => (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash })).data.payment;
const invoice = async () => (await owner('POST', '/api/plan/invoices', {})).data.invoice;
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const nox = (inv) => inv.amounts.find((a) => a.symbol === 'NOX').amount;

test('admins learn when NOX starts taking a fee on transfers between wallets', async () => {
  await checkTransferFee();
  assert.equal(await feeShown(), 0, 'a token without fees() takes none');
  chain.setTransferFee(0);
  await checkTransferFee();
  assert.equal(await feeShown(), 0);
  chain.setTransferFee(100);
  await checkTransferFee();
  assert.equal(await feeShown(), 100);
});

test('a bounty paid with the exact amount still counts when NOX keeps its fee on the way', async () => {
  const paid = await bounty('Fee work');
  chain.mine(5);
  const payment = await record(paid, charged({ from: ownerWallet.address, to: paid.intent.to, amount: paid.intent.amount, depth: 3 }));
  assert.equal(payment.state, 'paid', payment.problem);
  assert.equal(payment.amount, String(net(paid.intent.amount)), 'the amount is what really arrived');
  assert.equal(payment.fee, String(BigInt(paid.intent.amount) - net(paid.intent.amount)), 'and the fee is what NOX kept');
  assert.equal((await owner('GET', `/api/tasks/${paid.task.id}/detail`)).data.task.bountyState, 'paid');

  // short by anything other than the fee is still not the amount Nil asked for
  const other = await bounty('Short work');
  const shortHash = tx();
  chain.mine(5);
  chain.addTransfer({ hash: shortHash, token: NOX, from: ownerWallet.address, to: other.intent.to, value: String(net(other.intent.amount) - 1n), depth: 3 });
  assert.equal((await record(other, shortHash)).state, 'failed');
});

test('a bounty short by the fee doesn’t count when the token kept no fee on it', async () => {
  const short = await bounty('No fee kept');
  const hash = tx();
  chain.mine(5);
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: short.intent.to, value: String(net(short.intent.amount)), depth: 3 });
  assert.equal((await record(short, hash)).state, 'failed');
});

test('a Nil Pro invoice paid in NOX through the fee is found by the scan and paid', async () => {
  const inv = await invoice();
  chain.mine(1);
  charged({ from: wallet().address, to: TREASURY, amount: nox(inv) });
  chain.mine(3);
  await watchInvoices();
  const paid = await view(inv.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.payments[0].fee, String(BigInt(nox(inv)) - net(nox(inv))));
});

test('an invoice payment short by the fee fails when the token kept none', async () => {
  const inv = await invoice();
  chain.mine(1);
  chain.addTransfer({ hash: tx(), token: NOX, from: wallet().address, to: TREASURY, value: String(net(nox(inv))), depth: 1 });
  chain.mine(3);
  await watchInvoices();
  const short = await view(inv.id);
  assert.deepEqual([short.state, short.payments[0].status], ['waiting', 'failed']);
  assert.match(short.payments[0].problem, /kept no fee/);
  await owner('POST', `/api/plan/invoices/${inv.id}/cancel`);
});

test('the scan counts the fee in the transfer’s own block, not today’s', async () => {
  const inv = await invoice();
  chain.mine(1);
  charged({ from: wallet().address, to: TREASURY, amount: nox(inv) });
  // governance raises the fee before the scan gets to it
  chain.mine(1);
  chain.setTransferFee(200);
  await checkTransferFee();
  assert.equal(await feeShown(), 200);
  chain.mine(3);
  await watchInvoices();
  assert.equal((await view(inv.id)).status, 'paid');
});

test('a fee reading above what governance can set is ignored, so a short transfer never pays', async () => {
  chain.setTransferFee(10_000);
  await checkTransferFee();
  assert.equal(await feeShown(), 0);
  const inv = await invoice();
  chain.mine(1);
  chain.addTransfer({ hash: tx(), token: NOX, from: wallet().address, to: TREASURY, value: '0', depth: 1 });
  charged({ from: wallet().address, to: TREASURY, amount: nox(inv), bps: 500 });
  chain.mine(3);
  await watchInvoices();
  const after = await view(inv.id);
  assert.deepEqual([after.status, after.payments.length], ['open', 0]);

  const late = await bounty('Over the cap');
  chain.mine(5);
  assert.equal((await record(late, charged({ from: ownerWallet.address, to: late.intent.to, amount: late.intent.amount, bps: 500, depth: 3 }))).state, 'failed');
});
