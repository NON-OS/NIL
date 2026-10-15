import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const FAKE_NOX = '0x1111111111111111111111111111111111111111';
const BOUNTY = (250n * 10n ** 18n).toString();
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Jane Doe', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

const newBountyTask = async (title) => (await owner('POST', '/api/tasks', { title, assigneeId: ids.member, bounty: BOUNTY })).data.task;
const pay = (taskId, hash) => owner('POST', `/api/tasks/${taskId}/payments`, { txHash: hash });

test('the app learns the NOX token, and only admins can set bounties', async () => {
  const boot = await member('GET', '/api/bootstrap');
  assert.equal(boot.data.nox.token, NOX);
  assert.equal(boot.data.nox.decimals, 18);
  assert.equal((await member('POST', '/api/tasks', { title: 'Sneaky', bounty: BOUNTY })).status, 403);
  const t = await newBountyTask('Audit the staking contract');
  assert.equal(t.bounty, BOUNTY);
  assert.equal((await member('PATCH', `/api/tasks/${t.id}`, { bounty: '1' })).status, 403);
  assert.equal((await owner('PATCH', `/api/tasks/${t.id}`, { bounty: '-5' })).status, 400);
  assert.equal((await owner('PATCH', `/api/tasks/${t.id}`, { bounty: 12 })).status, 400);
  ids.task = t.id;
});

test('a correct on-chain payment settles the bounty and signs a payment receipt', async () => {
  await owner('PATCH', `/api/tasks/${ids.task}`, { status: 'done' });
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: memberWallet.address, value: BOUNTY });
  const res = await pay(ids.task, hash);
  assert.equal(res.status, 200);
  assert.equal(res.data.payment.status, 'confirmed');
  assert.equal(res.data.payment.from, ownerWallet.address.toLowerCase());

  assert.equal((await owner('GET', `/api/tasks/${ids.task}/detail`)).data.task.bountyState, 'paid');
  assert.ok((await member('GET', '/api/notifications')).data.some((n) => n.type === 'bounty_paid' && n.data.amount === BOUNTY));

  const mine = (await member('GET', '/api/proofs/mine')).data;
  const receipt = mine.receipts.find((r) => r.kind === 'payment');
  const body = JSON.parse(receipt.body);
  assert.equal(body.type, 'nonos.payment');
  assert.equal(body.payment.tx, hash);
  assert.equal(body.payment.amount, BOUNTY);
  assert.equal(body.payment.token, NOX);
  assert.equal(body.contributor.wallet, memberWallet.address.toLowerCase());
  const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: mine.key }, format: 'jwk' });
  assert.equal(crypto.verify(null, Buffer.from(receipt.body), key, Buffer.from(receipt.signature, 'base64url')), true);

  // reopening the task revokes the work receipt but never the payment receipt
  await owner('PATCH', `/api/tasks/${ids.task}`, { status: 'in_progress' });
  const after = (await member('GET', '/api/proofs/mine')).data.receipts;
  assert.ok(after.some((r) => r.kind === 'payment'));
  assert.equal((await owner('PATCH', `/api/tasks/${ids.task}`, { bounty: '1' })).status, 409);
  assert.equal((await pay(ids.task, tx())).status, 409);
});

test('the same transaction can never pay two bounties', async () => {
  const t = await newBountyTask('Write grant report');
  const hash = (await owner('GET', '/api/bounties')).data.payments[0].txHash;
  assert.equal((await pay(t.id, hash)).status, 409);
});

test('look-alike tokens, other senders, short payments and reverted transactions are refused', async () => {
  const cases = [
    [{ token: FAKE_NOX, from: ownerWallet.address, value: BOUNTY }, /no NOX transfer/],
    [{ token: NOX, from: wallet().address, value: BOUNTY }, /isn’t yours or a treasury/],
    [{ token: NOX, from: ownerWallet.address, value: '1000' }, /Less NOX/],
    [{ token: NOX, from: ownerWallet.address, value: BOUNTY, status: '0x0' }, /failed on-chain/],
  ];
  for (const [transfer, problem] of cases) {
    const t = await newBountyTask('Edge case');
    const hash = tx();
    chain.addTransfer({ hash, to: memberWallet.address, ...transfer });
    const res = await pay(t.id, hash);
    assert.equal(res.data.payment.status, 'failed');
    assert.match(res.data.payment.problem, problem);
    assert.equal((await owner('GET', `/api/tasks/${t.id}/detail`)).data.task.bountyState, null);
    assert.equal((await owner('DELETE', `/api/payments/${res.data.payment.id}`)).status, 200);
  }
});

test('payments wait for confirmations, and treasury addresses may fund bounties', async () => {
  const safe = wallet().address;
  assert.equal((await member('PUT', '/api/bounties/treasury', { addresses: [safe] })).status, 403);
  assert.equal((await owner('PUT', '/api/bounties/treasury', { addresses: ['not-an-address'] })).status, 400);
  assert.deepEqual((await owner('PUT', '/api/bounties/treasury', { addresses: [safe] })).data.treasury, [safe.toLowerCase()]);

  const t = await newBountyTask('Paid from the Safe');
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: safe, to: memberWallet.address, value: BOUNTY, depth: 1 });
  const first = await pay(t.id, hash);
  assert.equal(first.data.payment.status, 'pending');
  assert.equal((await owner('GET', `/api/tasks/${t.id}/detail`)).data.task.bountyState, 'pending');
  assert.equal((await owner('PATCH', `/api/tasks/${t.id}`, { bounty: '5' })).status, 409);
  chain.mine(5);
  const again = await owner('POST', `/api/payments/${first.data.payment.id}/check`);
  assert.equal(again.data.payment.status, 'confirmed');
  assert.equal(again.data.payment.from, safe.toLowerCase());
});

test('the overview shows promised, owed and paid; members see only their own payments', async () => {
  await owner('POST', '/api/tasks', { title: 'Open bounty', assigneeId: ids.member, bounty: '7' });
  const mine = (await member('GET', '/api/bounties')).data;
  const me = mine.people.find((p) => p.userId === ids.member);
  assert.equal(me.paid, (2n * BigInt(BOUNTY)).toString());
  assert.ok(BigInt(me.promised) >= 7n);
  assert.ok(mine.payments.every((p) => p.payeeId === ids.member));
  assert.deepEqual(mine.treasury, []);
  assert.equal((await member('POST', `/api/tasks/${ids.task}/payments`, { txHash: tx() })).status, 403);
  assert.equal((await owner('POST', `/api/tasks/${ids.task}/payments`, { txHash: 'nonsense' })).status, 400);
});
