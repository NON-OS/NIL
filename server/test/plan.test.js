import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import trusteePartial from './helpers/trusteePartial.js';
import publishKey from './helpers/publishKey.js';
import dealVoteKey from './helpers/dealVoteKey.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const DAY = 86_400_000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
const stranger = () => wallet().address;

let srv;
let watchInvoices;
let sql;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const cy = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const cyWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_SEAT_USD: '2', PLAN_FREE_SEATS: '2', PLAN_TRIAL_DAYS: '0', PLAN_GRACE_DAYS: '7', PLAN_NOX_USD: '0.05', PLAN_NOX_DISCOUNT: '20', PLAN_INVOICES_PER_DAY: '40', NOX_FINALITY_DEPTH: '5' },
  });
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const create = async (body = {}) => {
  const res = await owner('POST', '/api/plan/invoices', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.invoice;
};
const view = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;
const amount = (invoice, symbol) => BigInt(invoice.amounts.find((a) => a.symbol === symbol).amount);
const pay = (token, value, { from = stranger(), depth = 1, hash = tx() } = {}) => {
  chain.addTransfer({ hash, token, from, to: TREASURY, value: String(value), depth });
  return hash;
};
// the finalized block trails the head by two, so three more blocks make anything at the head final
const finalize = async () => {
  chain.mine(3);
  await watchInvoices();
};
// housekeeping between tests, so leftover open invoices don't hold suffixes or credit
const cancelOpen = () => sql.run("UPDATE billing_invoices SET status = 'cancelled', closed_at = ? WHERE status = 'open'", Date.now());

test('without Nil Pro, the paid utilities are locked and reading is not', async () => {
  const status = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([status.enforced, status.unlocked, status.freeSeats, status.seatsUsed, status.seatLimit], [true, false, 2, 2, 2]);
  assert.equal(status.priceUsd, 10_000_000);
  assert.equal((await owner('POST', '/api/tasks', { title: 'Bounty', assigneeId: ids.member, bounty: '5' })).status, 402);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Vote' })).status, 402);
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: '1' })).status, 402);
  const third = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal(third.status, 402);
  assert.match(third.data.error, /free plan includes 2 people/);
  assert.equal((await owner('GET', '/api/bootstrap')).status, 200);
  assert.equal((await owner('POST', '/api/tasks', { title: 'Plain tasks stay free' })).status, 200);
  // members see the status but can't bill
  assert.equal((await member('POST', '/api/plan/invoices', {})).status, 403);
  assert.equal((await member('GET', '/api/plan/invoices')).status, 403);
});

test('an invoice prices in USD and asks for exact USDC and discounted NOX amounts with a unique suffix', async () => {
  const one = await create({ periods: 1 });
  assert.equal(one.state, 'waiting');
  assert.deepEqual([one.price.totalUsd, one.price.dueUsd, one.price.noxPercent, one.people, one.seats], [10_000_000, 10_000_000, 20, 2, 0]);
  const usdc = amount(one, 'USDC');
  const nox = amount(one, 'NOX');
  // $10.00 plus a suffix in the four places below the cent
  assert.equal(usdc / 10_000n, 1000n);
  const suffix = usdc % 10_000n;
  assert.ok(suffix > 0n);
  // $10 less 20% = $8, at $0.05 per NOX = 160 NOX, plus the same suffix in the 5th to 8th decimal places
  assert.equal(nox / 10n ** 14n, 160n * 10_000n);
  assert.equal((nox % 10n ** 14n) / 10n ** 10n, suffix);
  assert.equal(nox % 10n ** 10n, 0n);
  assert.match(one.amounts[0].link, /^ethereum:0x[0-9a-f]{40}@1\/transfer\?address=0x7{40}&uint256=\d+$/);

  const two = await create({ periods: 3, people: 4 });
  // three periods for four people: 3 × $10 + 3 × 2 seats × $2
  assert.deepEqual([two.price.baseUsd, two.price.seatsUsd, two.price.totalUsd], [30_000_000, 12_000_000, 42_000_000]);
  assert.notEqual(amount(two, 'USDC') % 10_000n, suffix);
  assert.equal((await owner('POST', '/api/plan/invoices', { people: 1 })).status, 400);
  assert.equal((await owner('POST', '/api/plan/invoices', { periods: 99 })).status, 400);
  await cancelOpen();
});

test('an exact transfer from any wallet pays the invoice, but only once its block is final', async () => {
  const invoice = await create({ periods: 2 });
  const exact = amount(invoice, 'USDC');
  chain.mine(1);
  pay(USDC, exact - 1n);
  pay(USDC, exact + 1n);
  await watchInvoices();
  assert.equal((await view(invoice.id)).state, 'waiting', 'amounts that differ in any digit are someone else’s');

  // an exchange withdrawal: a sender nobody here knows
  const hash = pay(USDC, exact);
  await watchInvoices();
  const confirming = await view(invoice.id);
  assert.equal(confirming.state, 'confirming');
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);

  await finalize();
  const paid = await view(invoice.id);
  assert.equal(paid.state, 'paid');
  assert.equal(paid.payments[0].txHash, hash);
  assert.equal(paid.payments[0].status, 'final');
  assert.equal(paid.payments[0].usd, Number(exact));
  const row = sql.get('SELECT block_hash FROM billing_payments WHERE tx_hash = ?', hash);
  assert.match(row.block_hash, /^0x[0-9a-f]{64}$/);
  const status = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([status.unlocked, status.source], [true, 'paid']);
  // two periods of 30 days, plus the suffix: a few millionths of a dollar buy a few seconds
  const days = (status.paidUntil - Date.now()) / DAY;
  assert.ok(days > 59.99 && days < 60.01, String(days));

  // the same transfer is never counted twice, even when someone names it again
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash })).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM billing_payments WHERE tx_hash = ?', hash).n, 1);
  assert.equal((await owner('GET', '/api/plan')).data.paidUntil, status.paidUntil);
});

test('a payment meant for another workspace on the same treasury is never counted here', async () => {
  const invoice = await create();
  const mine = amount(invoice, 'NOX');
  // another workspace's invoice: the same price, a different suffix
  const theirs = mine - ((mine % 10n ** 14n) / 10n ** 10n) * 10n ** 10n + (((mine % 10n ** 14n) / 10n ** 10n + 1n) % 10_000n || 1n) * 10n ** 10n;
  chain.mine(1);
  const hash = pay(NOX, theirs);
  await watchInvoices();
  assert.equal((await view(invoice.id)).state, 'waiting');
  // naming it doesn't help: the amount isn't one this workspace asked for
  const named = await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash });
  assert.equal(named.data.invoice.state, 'waiting');
  const placeholder = named.data.invoice.payments.find((p) => p.txHash === hash);
  assert.equal(placeholder.status, 'unmatched');
  assert.match(placeholder.problem, /doesn’t carry this invoice’s amount/);

  // and a transfer sent before the invoice existed can't pay it, even with the right amount
  const early = await create();
  const exact = amount(early, 'USDC');
  chain.addTransfer({ hash: tx(), token: USDC, from: stranger(), to: TREASURY, value: String(exact), depth: 3 });
  await watchInvoices();
  await finalize();
  assert.equal((await view(early.id)).state, 'waiting');
  await cancelOpen();
});

test('the browser wallet’s transaction shows as seen, then confirming, then paid', async () => {
  const invoice = await create();
  const hash = tx();
  const seen = await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: hash });
  assert.equal(seen.data.invoice.state, 'seen');
  // garbage and replays are refused with a reason
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: 'nope' })).status, 400);

  chain.addTransferAt({ hash, token: NOX, from: ownerWallet.address, to: TREASURY, value: String(amount(invoice, 'NOX')), atBlock: chain.head() + 1 });
  chain.mine(1);
  await watchInvoices();
  assert.equal((await view(invoice.id)).state, 'confirming');
  await finalize();
  const paid = await view(invoice.id);
  assert.equal(paid.state, 'paid');
  // NOX is credited at the locked rate: 160 NOX at $0.05 is the $8 asked
  assert.ok(paid.payments[0].usd >= 8_000_000 && paid.payments[0].usd < 8_000_100);
});

test('a reorg before finality moves the payment to its new block; a dropped one stops counting', async () => {
  const invoice = await create();
  const payer = stranger();
  chain.mine(1);
  const hash = pay(USDC, amount(invoice, 'USDC'), { from: payer });
  await watchInvoices();
  const first = sql.get('SELECT block_number, block_hash FROM billing_payments WHERE tx_hash = ?', hash);

  // the block is replaced and the transaction lands one block later
  chain.reorg(first.block_number, { hash, moveTo: first.block_number + 1 });
  chain.mine(1);
  await watchInvoices();
  const moved = sql.get('SELECT status, block_number, block_hash FROM billing_payments WHERE tx_hash = ?', hash);
  assert.equal(moved.status, 'confirming');
  assert.equal(moved.block_number, first.block_number + 1);
  assert.notEqual(moved.block_hash, first.block_hash);

  // and then it disappears from the chain before it was final: it stops counting, but is watched
  chain.drop(hash);
  await watchInvoices();
  const dropped = await view(invoice.id);
  assert.equal(dropped.state, 'waiting');
  assert.deepEqual([dropped.payments[0].status, dropped.payments[0].blockNumber], ['confirming', null]);
  await finalize();
  assert.equal((await view(invoice.id)).state, 'waiting');

  // it is mined again: the scan picks it up and it counts
  chain.addTransfer({ hash, token: USDC, from: payer, to: TREASURY, value: String(amount(invoice, 'USDC')), depth: 1 });
  await watchInvoices();
  assert.equal((await view(invoice.id)).state, 'confirming');
  await finalize();
  assert.equal((await view(invoice.id)).state, 'paid');
});

test('on a node without the finalized tag, a fixed depth decides finality', async () => {
  chain.setFinalityLag(null);
  try {
    const invoice = await create();
    chain.mine(1);
    pay(USDC, amount(invoice, 'USDC'));
    chain.mine(3);
    await watchInvoices();
    assert.equal((await view(invoice.id)).state, 'confirming', 'four blocks deep is short of NOX_FINALITY_DEPTH=5');
    chain.mine(2);
    await watchInvoices();
    assert.equal((await view(invoice.id)).state, 'paid');
  } finally {
    chain.setFinalityLag(2);
  }
});

test('a transaction pays one thing: never a bounty and an invoice both', async () => {
  const invoice = await create();
  // a bounty payment already recorded here
  const bountyTask = (await owner('POST', '/api/tasks', { title: 'Fix the bug', assigneeId: ids.member, bounty: String(10n ** 18n) })).data.task;
  const intent = (await owner('POST', `/api/tasks/${bountyTask.id}/payments/intent`, {})).data.intent;
  const bountyHash = tx();
  chain.mine(1);
  chain.addTransfer({ hash: bountyHash, token: NOX, from: ownerWallet.address, to: memberWallet.address, value: intent.amount, depth: 1 });
  assert.equal((await owner('POST', `/api/tasks/${bountyTask.id}/payments`, { intentId: intent.id, txHash: bountyHash })).status, 200);
  const reuse = await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: bountyHash });
  assert.equal(reuse.status, 409);
  assert.match(reuse.data.error, /already pays a bounty/);

  // and the other way round
  const planHash = pay(USDC, amount(invoice, 'USDC'));
  await finalize();
  assert.equal((await view(invoice.id)).state, 'paid');
  const other = (await owner('POST', '/api/tasks', { title: 'Another', assigneeId: ids.member, bounty: '7' })).data.task;
  const otherIntent = (await owner('POST', `/api/tasks/${other.id}/payments/intent`, {})).data.intent;
  const res = await owner('POST', `/api/tasks/${other.id}/payments`, { intentId: otherIntent.id, txHash: planHash });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /pays for Nil Pro/);
});

test('an expired invoice can be made again, and a payment that arrives late becomes credit', async () => {
  await cancelOpen();
  const invoice = await create();
  const exact = amount(invoice, 'USDC');
  sql.run('UPDATE billing_invoices SET expires_at = ? WHERE id = ?', Date.now() - 1000, invoice.id);
  await watchInvoices();
  const expired = await view(invoice.id);
  assert.equal(expired.state, 'expired');

  // the money arrives after the window: it isn't lost, it waits as credit
  chain.mine(1);
  const late = pay(USDC, exact);
  await watchInvoices();
  await finalize();
  const after = await view(invoice.id);
  assert.equal(after.state, 'expired');
  const payment = after.payments.find((p) => p.txHash === late);
  assert.deepEqual([payment.status, payment.onTime], ['final', false]);
  const list = (await owner('GET', '/api/plan/invoices')).data;
  assert.equal(list.credit, Number(exact));

  // making it again takes the credit off, and here the credit covers it all
  const before = (await owner('GET', '/api/plan')).data.paidUntil;
  const retried = (await owner('POST', `/api/plan/invoices/${invoice.id}/retry`)).data.invoice;
  assert.equal(retried.retryOf, invoice.id);
  assert.equal(retried.price.creditUsd, 10_000_000);
  assert.equal(retried.state, 'paid');
  assert.equal(retried.amounts.length, 0);
  const extended = (await owner('GET', '/api/plan')).data.paidUntil;
  assert.ok(Math.abs(extended - before - 30 * DAY) < 5000);
  assert.equal((await owner('GET', '/api/plan/invoices')).data.credit, Number(exact) - 10_000_000);
  // an open invoice can't be retried, and a paid one can't be cancelled
  assert.equal((await owner('POST', `/api/plan/invoices/${retried.id}/cancel`)).status, 400);
});

test('a cancelled invoice can’t be paid, and what reaches it anyway is credit', async () => {
  const invoice = await create();
  assert.equal((await owner('POST', `/api/plan/invoices/${invoice.id}/retry`)).status, 400);
  const cancelled = (await owner('POST', `/api/plan/invoices/${invoice.id}/cancel`)).data.invoice;
  assert.equal(cancelled.state, 'cancelled');
  const credit = (await owner('GET', '/api/plan/invoices')).data.credit;
  chain.mine(1);
  pay(NOX, amount(invoice, 'NOX'));
  await watchInvoices();
  await finalize();
  const after = await view(invoice.id);
  assert.equal(after.state, 'cancelled');
  const late = after.payments[0];
  assert.deepEqual([late.status, late.onTime], ['final', false]);
  // the NOX asked for was worth what was due, less the 20% NOX discount
  // the NOX asked for is worth what was due less the 20% NOX discount, rounded up by at most
  // two steps of the 0.0001 NOX grid (the price part and the suffix)
  const owed = Math.ceil(after.price.dueUsd * 0.8);
  assert.ok(late.usd >= owed - 1 && late.usd <= owed + 10, `${late.usd} for ${owed}`);
  assert.equal((await owner('GET', '/api/plan/invoices')).data.credit - credit, late.usd);
});

test('a failed transaction and an unknown one each say what happened', async () => {
  const invoice = await create();
  const failed = tx();
  chain.mine(1);
  chain.addTransfer({ hash: failed, token: USDC, from: stranger(), to: TREASURY, value: String(amount(invoice, 'USDC')), status: '0x0', depth: 1 });
  const res = await owner('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: failed });
  const p = res.data.invoice.payments.find((x) => x.txHash === failed);
  assert.equal(p.status, 'failed');
  assert.match(p.problem, /failed on-chain/);
  assert.equal(res.data.invoice.state, 'waiting');
  await cancelOpen();
});

test('an invoice that can be paid in full by credit or by perks still shows the right price', async () => {
  const q = (await owner('GET', '/api/plan/quote?periods=2&people=5')).data;
  // 2 × $10 + 2 × 3 seats × $2, with the credit left from earlier coming off
  assert.equal(q.subtotalUsd, 32_000_000);
  assert.ok(q.creditUsd > 0);
  assert.equal(q.dueUsd, q.totalUsd - q.creditUsd);
  assert.deepEqual(q.tokens.map((t) => [t.symbol, t.rateSource]), [['USDC', 'face'], ['NOX', 'manual']]);
  assert.equal((await member('GET', '/api/plan/quote')).status, 403);
});

test('paid utilities work, seats follow what was paid, and promised bounties stay payable after a lapse', async () => {
  const status = (await owner('GET', '/api/plan')).data;
  assert.equal(status.unlocked, true);
  // the plan covers the two people it was bought for, so a third needs seats
  assert.equal(status.seatLimit, 2);
  const blocked = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal(blocked.status, 402);
  assert.match(blocked.data.error, /plan covers 2 people/);

  // seats for the rest of the paid time
  const seats = await create({ kind: 'seats', people: 3 });
  assert.equal(seats.kind, 'seats');
  assert.ok(seats.price.seatsUsd > 0 && seats.price.baseUsd === 0);
  chain.mine(1);
  pay(USDC, amount(seats, 'USDC'));
  await finalize();
  assert.equal((await view(seats.id)).state, 'paid');
  assert.equal((await owner('GET', '/api/plan')).data.seatLimit, 3);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.cy = (await cy.wallet(cyWallet, 'invite', { name: 'Cy', inviteToken: inv.data.token })).data.user.id;
  assert.ok(ids.cy);

  const t = (await owner('POST', '/api/tasks', { title: 'Paid feature', assigneeId: ids.member, bounty: (10n * 10n ** 18n).toString() })).data.task;
  const { default: billingState } = await import('../billing/billingState.js');
  billingState.set('plan', { ...billingState.get('plan'), paidUntil: Date.now() - 3 * DAY });
  assert.equal((await owner('GET', '/api/plan')).data.inGrace, true);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Still in grace' })).status, 200);

  billingState.set('plan', { ...billingState.get('plan'), paidUntil: Date.now() - 30 * DAY });
  assert.equal((await owner('POST', '/api/proposals', { title: 'Lapsed' })).status, 402);
  const intent = (await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).data.intent;
  const hash = tx();
  chain.mine(4);
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: memberWallet.address, value: intent.amount, depth: 4 });
  const payout = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash });
  assert.equal(payout.data.payment.status, 'confirmed');
});

test('after a lapse, votes already open still finish, and new paid things stay locked', async () => {
  const { default: billingState } = await import('../billing/billingState.js');
  billingState.set('plan', { ...billingState.get('plan'), paidUntil: Date.now() + 10 * DAY });
  for (const [who, w] of [[owner, ownerWallet], [member, memberWallet], [cy, cyWallet]]) assert.equal((await publishKey(who, w)).status, 200);

  const signed = (await owner('POST', '/api/proposals', { title: 'Opened while paid' })).data.proposal;
  const encrypted = (await owner('POST', '/api/proposals', { title: 'Encrypted, opened while paid', weighting: 'power', anonymous: true, trustees: [ids.owner, ids.member, ids.cy] })).data.proposal;
  const trustees = [[1, owner], [2, member], [3, cy]];
  const { lines, responses } = await dealVoteKey(encrypted.id, trustees);
  assert.ok(responses.every((r) => r.status === 200));

  billingState.set('plan', { ...billingState.get('plan'), paidUntil: Date.now() - 30 * DAY });
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);
  assert.equal((await owner('POST', '/api/proposals', { title: 'A new vote' })).status, 402);
  assert.equal((await owner('POST', '/api/tasks', { title: 'A new bounty', assigneeId: ids.member, bounty: '5' })).status, 402);
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: '1' })).status, 402);

  // a signed ballot on a vote opened while the plan was active still counts
  const ballot = await member('POST', `/api/proposals/${signed.id}/ballot`, { choice: 0 });
  assert.equal(ballot.status, 200);
  const cast = await member('POST', `/api/proposals/${signed.id}/vote`, { ballotId: ballot.data.ballotId, signature: memberWallet.sign(ballot.data.message) });
  assert.equal(cast.status, 200);
  assert.equal(cast.data.proposal.voters, 1);

  // the vote closes and two trustees decrypt its totals, plan or no plan
  assert.equal((await owner('POST', `/api/proposals/${encrypted.id}/close`)).status, 200);
  const { aggregates } = (await member('GET', '/api/proposals')).data.find((p) => p.id === encrypted.id).encrypted;
  for (const [position, who] of trustees.slice(0, 2)) {
    assert.equal((await who('POST', `/api/proposals/${encrypted.id}/partial`, trusteePartial(lines, position, aggregates))).status, 200);
  }
  const decrypted = (await owner('GET', '/api/proposals')).data.find((p) => p.id === encrypted.id);
  assert.deepEqual(decrypted.totals, ['0', '0', '0']);
});

test('reactivating someone takes a seat again', async () => {
  await owner('PATCH', `/api/users/${ids.cy}`, { deactivated: true });
  const res = await owner('PATCH', `/api/users/${ids.cy}`, { deactivated: false });
  assert.equal(res.status, 402);
  assert.match(res.data.error, /free plan includes 2 people/);
});
