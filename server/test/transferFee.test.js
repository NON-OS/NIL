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
// what arrives of `amount` when NOX keeps 1%, rounded down like the contract
const lessOnePercent = (amount) => BigInt(amount) - (BigInt(amount) * 100n) / 10_000n;

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
  const task = (await owner('POST', '/api/tasks', { title: 'Fee work', assigneeId: ids.member, bounty: String(100n * UNIT) })).data.task;
  const intent = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent;
  const arrived = lessOnePercent(intent.amount);
  const hash = tx();
  // mined a few blocks after the payment was started, and final
  chain.mine(5);
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: intent.to, value: String(arrived), depth: 3 });
  const payment = (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash })).data.payment;
  assert.equal(payment.state, 'paid', payment.problem);
  assert.equal(payment.amount, String(arrived), 'the amount is what really arrived');
  assert.equal(payment.fee, String(BigInt(intent.amount) - arrived), 'and the fee is what NOX kept');
  assert.equal((await owner('GET', `/api/tasks/${task.id}/detail`)).data.task.bountyState, 'paid');

  // short by anything other than the fee is still not the amount Nil asked for
  const other = (await owner('POST', '/api/tasks', { title: 'Short work', assigneeId: ids.member, bounty: String(100n * UNIT) })).data.task;
  const otherIntent = (await owner('POST', `/api/tasks/${other.id}/payments/intent`, {})).data.intent;
  const shortHash = tx();
  chain.mine(5);
  chain.addTransfer({ hash: shortHash, token: NOX, from: ownerWallet.address, to: otherIntent.to, value: String(lessOnePercent(otherIntent.amount) - 1n), depth: 3 });
  const refused = (await owner('POST', `/api/tasks/${other.id}/payments`, { intentId: otherIntent.id, txHash: shortHash })).data.payment;
  assert.equal(refused.state, 'failed');
});

test('a Nil Pro invoice paid in NOX through the fee is found by the scan and paid', async () => {
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const asked = invoice.amounts.find((a) => a.symbol === 'NOX').amount;
  chain.addTransfer({ hash: tx(), token: NOX, from: wallet().address, to: TREASURY, value: String(lessOnePercent(asked)), depth: 1 });
  chain.mine(3);
  await watchInvoices();
  const paid = (await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice;
  assert.equal(paid.status, 'paid');
  assert.equal(paid.payments[0].fee, String(BigInt(asked) - lessOnePercent(asked)));
});
