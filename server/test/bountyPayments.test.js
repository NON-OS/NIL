import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const UNIT = 10n ** 18n;
const BOUNTY = (100n * UNIT).toString();
const GRID = 10n ** 14n;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let sql;
let checkPayments;
let refreshBountyState;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { NOX_MISSING_TX_HOURS: '1', REWARD_TOKENS: 'USDC:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:6,GUSD:0x056fd409e1d7a124bd7017459dfea2f387b6d5cd:2' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: checkPayments } = await import('../jobs/checkPayments.js'));
  ({ default: refreshBountyState } = await import('../services/refreshBountyState.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Jane Doe', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const task = async (bounty = BOUNTY) => (await owner('POST', '/api/tasks', { title: 'Bounty work', assigneeId: ids.member, bounty })).data.task;
const start = async (taskId) => (await owner('POST', `/api/tasks/${taskId}/payments/intent`, {})).data.intent;
const record = (taskId, intentId, txHash) => owner('POST', `/api/tasks/${taskId}/payments`, { intentId, txHash });
const state = async (taskId) => (await owner('GET', `/api/tasks/${taskId}/detail`)).data.task.bountyState;
const send = (to, value, { depth = 1, hash = tx(), from = ownerWallet.address } = {}) => {
  chain.addTransfer({ hash, token: NOX, from, to, value: String(value), depth });
  return hash;
};
const check = async (id) => (await owner('POST', `/api/payments/${id}/check`)).data.payment;

test('a payment starts in Nil with the exact amount still owed, ending in its own suffix', async () => {
  const t = await task();
  const a = await start(t.id);
  const b = await start(t.id);
  assert.equal(a.to, memberWallet.address.toLowerCase());
  // 100 NOX, rounded to the 0.0001 grid, plus a suffix in the 5th to 8th decimal places
  assert.equal(BigInt(a.amount) / GRID, 100n * 10_000n);
  assert.ok(BigInt(a.amount) % GRID > 0n);
  assert.notEqual(a.amount, b.amount);
  assert.ok(a.expiresAt > Date.now() + 13 * 86_400_000);
  // a task without an assignee wallet, or without a bounty, can't be paid
  const plain = (await owner('POST', '/api/tasks', { title: 'No bounty', assigneeId: ids.member })).data.task;
  assert.equal((await owner('POST', `/api/tasks/${plain.id}/payments/intent`, {})).status, 400);
});

test('a token with too few decimal places to carry a suffix is refused up front', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'Two decimals', assigneeId: ids.member, bounty: '1000', bountyToken: 'GUSD' })).data.task;
  const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, {});
  assert.equal(res.status, 400);
  assert.match(res.data.error, /GUSD has too few decimal places/);
});

test('sending the same transaction twice records one payment, and it pays only its own task', async () => {
  const t = await task();
  const intent = await start(t.id);
  chain.mine(4);
  const hash = send(intent.to, intent.amount, { depth: 4 });
  const first = await record(t.id, intent.id, hash);
  const again = await record(t.id, intent.id, hash);
  assert.equal(first.status, 200);
  assert.equal(again.status, 200);
  assert.equal(again.data.payment.id, first.data.payment.id);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM payments WHERE tx_hash = ?', hash).n, 1);
  assert.equal(first.data.payment.state, 'paid');

  // another task can't use that transaction, nor another task's payment
  const other = await task();
  const otherIntent = await start(other.id);
  assert.equal((await record(other.id, otherIntent.id, hash)).status, 409);
  assert.equal((await record(other.id, intent.id, tx())).status, 400);
  assert.equal((await record(other.id, null, tx())).status, 400);
});

test('a transfer mined before the payment was started can’t pay it, even with the exact amount', async () => {
  const t = await task();
  const intent = await start(t.id);
  // in the block the payment started at minus one: sent before Nil handed out the amount
  const hash = send(intent.to, intent.amount, { depth: 2 });
  chain.mine(3);
  const res = await record(t.id, intent.id, hash);
  assert.equal(res.data.payment.status, 'failed');
  assert.match(res.data.payment.problem, /mined before the payment was started/);
  assert.equal(await state(t.id), null);
});

test('a payment counts only at a final block, and a reorg before that is followed', async () => {
  const t = await task();
  const intent = await start(t.id);
  chain.mine(1);
  const hash = send(intent.to, intent.amount);
  const recorded = (await record(t.id, intent.id, hash)).data.payment;
  assert.equal(recorded.state, 'confirming');
  assert.equal(await state(t.id), 'pending');
  const first = sql.get('SELECT block_number, block_hash FROM payments WHERE id = ?', recorded.id);
  assert.match(first.block_hash, /^0x[0-9a-f]{64}$/);

  // the block is replaced and the transaction lands one block later
  chain.reorg(first.block_number, { hash, moveTo: first.block_number + 1 });
  chain.mine(1);
  assert.equal((await check(recorded.id)).state, 'confirming');
  const moved = sql.get('SELECT block_number, block_hash FROM payments WHERE id = ?', recorded.id);
  assert.deepEqual([moved.block_number, moved.block_hash !== first.block_hash], [first.block_number + 1, true]);

  // then it drops out of the chain: back to waiting for a block, with a reason
  chain.drop(hash);
  const dropped = await check(recorded.id);
  assert.equal(dropped.state, 'sent');
  assert.match(dropped.problem, /reorganisation/);

  // mined again, and final this time
  send(intent.to, intent.amount, { hash, depth: 1 });
  chain.mine(3);
  const done = await check(recorded.id);
  assert.equal(done.state, 'paid');
  assert.equal(sql.get('SELECT block_number FROM payments WHERE id = ?', recorded.id).block_number, chain.blockOf(hash));
  assert.equal(await state(t.id), 'paid');
});

test('an underpayment is shown with what’s left, and the rest can be paid with a new payment', async () => {
  const t = await task();
  const intent = await start(t.id);
  chain.mine(4);
  // 40 NOX short, with the suffix intact so it's clearly this payment
  const short = (await record(t.id, intent.id, send(intent.to, BigInt(intent.amount) - 40n * UNIT, { depth: 4 }))).data.payment;
  assert.deepEqual([short.status, short.state], ['confirmed', 'underpaid']);
  assert.equal(await state(t.id), 'underpaid');
  const overview = (await owner('GET', '/api/bounties')).data.people.find((p) => p.userId === ids.member && p.token === 'NOX');
  assert.ok(BigInt(overview.promised) >= 40n * UNIT, 'only what is still owed stays promised');

  // the next payment asks for the 40 NOX still owed, give or take the grid
  const rest = await start(t.id);
  assert.equal(BigInt(rest.amount) / GRID, (BigInt(BOUNTY) - BigInt(short.amount) + GRID - 1n) / GRID);
  chain.mine(4);
  const done = (await record(t.id, rest.id, send(rest.to, rest.amount, { depth: 4 }))).data.payment;
  assert.equal(done.status, 'confirmed');
  assert.equal(await state(t.id), 'paid');
  assert.equal((await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).status, 409);
});

test('an overpayment still pays the bounty and shows as overpaid', async () => {
  const t = await task();
  const intent = await start(t.id);
  chain.mine(4);
  const over = (await record(t.id, intent.id, send(intent.to, BigInt(intent.amount) + 5n * UNIT, { depth: 4 }))).data.payment;
  assert.deepEqual([over.state, over.amount], ['overpaid', String(BigInt(intent.amount) + 5n * UNIT)]);
  assert.equal(await state(t.id), 'paid');
});

test('a stuck payment can be cancelled and paid again; if it lands anyway it still counts', async () => {
  const t = await task();
  const intent = await start(t.id);
  const stuck = tx();
  const pending = (await record(t.id, intent.id, stuck)).data.payment;
  assert.deepEqual([pending.status, pending.state], ['pending', 'sent']);
  assert.equal((await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).status, 409, 'one payment at a time');

  const cancelled = (await owner('POST', `/api/payments/${pending.id}/cancel`)).data.payment;
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(await state(t.id), null);

  // paid again with a fresh payment
  const again = await start(t.id);
  chain.mine(4);
  assert.equal((await record(t.id, again.id, send(again.to, again.amount, { depth: 4 }))).data.payment.state, 'paid');

  // the stuck transaction is mined after all: the money moved, so the record shows it
  chain.addTransferAt({ hash: stuck, token: NOX, from: ownerWallet.address, to: intent.to, value: intent.amount, atBlock: chain.head() + 1 });
  chain.mine(4);
  await checkPayments();
  const landed = sql.get('SELECT status, amount FROM payments WHERE id = ?', pending.id);
  assert.deepEqual({ ...landed }, { status: 'confirmed', amount: intent.amount });
  const paidOut = (await owner('GET', '/api/bounties')).data.payments.filter((p) => p.taskId === t.id && p.status === 'confirmed');
  assert.equal(paidOut.length, 2);
});

test('a bounty’s amount and token are fixed while a payment for it is on its way, paid, or cancelled but watched', async () => {
  const t = await task(String(UNIT));
  const intent = await start(t.id);
  const stuck = tx();
  const p = (await record(t.id, intent.id, stuck)).data.payment;
  const change = () => owner('PATCH', `/api/tasks/${t.id}`, { bounty: String(1_000_000n * 10n ** 6n), bountyToken: 'USDC' });
  assert.equal((await change()).status, 409, 'on its way');
  assert.equal((await owner('POST', `/api/payments/${p.id}/cancel`)).status, 200);
  const refused = await change();
  assert.equal(refused.status, 409, 'cancelled, but its transaction may still land');
  assert.match(refused.data.error, /still watched/);
  assert.equal((await owner('PATCH', `/api/tasks/${t.id}`, { bounty: null })).status, 409);

  // the 1 NOX lands after all and pays the 1 NOX bounty it was sent for
  chain.addTransferAt({ hash: stuck, token: NOX, from: ownerWallet.address, to: intent.to, value: intent.amount, atBlock: chain.head() + 1 });
  chain.mine(4);
  await checkPayments();
  const detail = (await owner('GET', `/api/tasks/${t.id}/detail`)).data.task;
  assert.deepEqual([detail.bounty, detail.bountyToken, detail.bountyState], [String(UNIT), 'NOX', 'paid']);
  assert.equal((await change()).status, 409);

  // once the watch is over, a cancelled payment no longer holds a bounty that nothing paid
  const other = await task(String(UNIT));
  const otherIntent = await start(other.id);
  const gone = (await record(other.id, otherIntent.id, tx())).data.payment;
  await owner('POST', `/api/payments/${gone.id}/cancel`);
  sql.run('UPDATE payments SET cancelled_at = ? WHERE id = ?', Date.now() - 8 * 86_400_000, gone.id);
  assert.equal((await owner('PATCH', `/api/tasks/${other.id}`, { bounty: '2' })).status, 200);
});

test('what a bounty has received counts only payments in the bounty’s own token', async () => {
  const t = await task(String(UNIT));
  const intent = await start(t.id);
  chain.mine(4);
  assert.equal((await record(t.id, intent.id, send(intent.to, intent.amount, { depth: 4 }))).data.payment.state, 'paid');
  // a task whose token was switched under a confirmed payment, before the rule above existed
  sql.run("UPDATE tasks SET bounty = ?, bounty_token = 'USDC' WHERE id = ?", String(10n ** 6n), t.id);
  assert.equal(refreshBountyState(t.id), null, 'NOX units never pay a USDC bounty');
  const usdcIntent = await start(t.id);
  assert.equal(BigInt(usdcIntent.amount) >= 10n ** 6n, true, 'the whole USDC bounty is still owed');
});

test('a payment whose transaction is already in a block can’t be cancelled', async () => {
  const t = await task();
  const intent = await start(t.id);
  chain.mine(1);
  const p = (await record(t.id, intent.id, send(intent.to, intent.amount))).data.payment;
  const res = await owner('POST', `/api/payments/${p.id}/cancel`);
  assert.equal(res.status, 409);
  assert.match(res.data.error, /already in a block/);
  assert.equal((await owner('POST', '/api/payments/nope/cancel')).status, 404);
});

test('a transaction that never shows up fails after NOX_MISSING_TX_HOURS', async () => {
  const t = await task();
  const intent = await start(t.id);
  const p = (await record(t.id, intent.id, tx())).data.payment;
  sql.run('UPDATE payments SET created_at = ? WHERE id = ?', Date.now() - 2 * 3_600_000, p.id);
  const failed = await check(p.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.problem, /never showed up/);
  assert.equal(await state(t.id), null);
});

test('a payment started for one assignee can’t pay after the task changed hands', async () => {
  const t = await task();
  const intent = await start(t.id);
  await owner('PATCH', `/api/tasks/${t.id}`, { assigneeId: (await owner('GET', '/api/bootstrap')).data.me.id });
  const res = await record(t.id, intent.id, tx());
  assert.equal(res.status, 409);
  assert.match(res.data.error, /changed hands/);
});

test('payments recorded before payments started in Nil are still checked, at finality', async () => {
  const t = await task();
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: memberWallet.address, value: BOUNTY, depth: 1 });
  sql.run("INSERT INTO payments (id, task_id, task_ref, payer_id, payee_id, to_address, amount, token, tx_hash, created_at) VALUES ('old-one', ?, 'NON-9', ?, ?, ?, ?, 'NOX', ?, ?)", t.id, (await owner('GET', '/api/bootstrap')).data.me.id, ids.member, memberWallet.address.toLowerCase(), BOUNTY, hash, Date.now());
  assert.equal((await check('old-one')).state, 'confirming');
  chain.mine(3);
  assert.equal((await check('old-one')).state, 'paid');
});

test('payment endpoints are rate limited per admin', async () => {
  const t = await task();
  let limited = null;
  for (let i = 0; i < 70 && !limited; i++) {
    const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, {});
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'expected a 429 within 70 quick requests');
  assert.match(limited.data.error, /Too many payment requests/);
});
