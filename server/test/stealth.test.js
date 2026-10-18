import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import { hexToBytes } from '@noble/hashes/utils';
import signTx from './helpers/signTx.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
const BOUNTY = (250n * 10n ** 18n).toString();
const VECTORS = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const [mine, other] = VECTORS;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
// what the payer's browser sends for a reference vector: the address and the public values only
const oneTime = (v) => ({ address: v.stealthAddress, ephemeralPublicKey: v.ephemeralPublicKey, viewTag: Number(v.viewTag) });
const metadata = (viewTag) => `${viewTag}a9059cbb${NOX.slice(2)}${BigInt(BOUNTY).toString(16).padStart(64, '0')}`;

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const mia = client(base);
const sam = client(base);
const ownerWallet = wallet();
const ids = {};

before(async () => {
  srv = await startServer({ chain, env: { STEALTH_BALANCE_SPREAD_SECONDS: '1' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  for (const [who, name] of [[mia, 'Mia'], [sam, 'Sam']]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[name] = (await who.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

const bountyTask = async () => (await owner('POST', '/api/tasks', { title: 'Private work', assigneeId: ids.Mia, bounty: BOUNTY, status: 'done' })).data.task;
// Starts a private payout in Nil at a one-time address, then lets blocks pass so the transfers
// added next land after it and are final.
async function startPrivate(taskId, one) {
  const res = await owner('POST', `/api/tasks/${taskId}/payments/intent`, { stealth: one });
  chain.mine(6);
  return res;
}

test('a meta-address is validated and shown only to admins and its owner', async () => {
  assert.equal((await mia('PUT', '/api/me/stealth', { metaAddress: 'st:eth:0x1234' })).status, 400);
  // right length, but not a point on the curve
  assert.equal((await mia('PUT', '/api/me/stealth', { metaAddress: `st:eth:0x02${'f'.repeat(64)}02${'f'.repeat(64)}` })).status, 400);
  const res = await mia('PUT', '/api/me/stealth', { metaAddress: mine.meta.toUpperCase().replace('ST:ETH:0X', 'st:eth:0x') });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.stealthMeta, mine.meta);
  const seenByOwner = (await owner('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.Mia);
  const seenBySam = (await sam('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.Mia);
  assert.equal(seenByOwner.stealthMeta, mine.meta);
  assert.equal(seenBySam.stealthMeta, null);
  assert.equal((await owner('GET', '/api/bootstrap')).data.stealth.announcer, ANNOUNCER);
});

test('a private payout settles when NOX reaches the payee’s stealth address, and counts as announced once the chain says so', async () => {
  const t = await bountyTask();
  const { intent } = (await startPrivate(t.id, oneTime(mine))).data;
  assert.deepEqual([intent.to, intent.stealth, intent.ephemeralPublicKey], [mine.stealthAddress, true, mine.ephemeralPublicKey]);
  const hash = tx();
  const announceTx = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: mine.stealthAddress, value: intent.amount });
  chain.addAnnouncement({ hash: announceTx, announcer: ANNOUNCER, stealthAddress: mine.stealthAddress, caller: ownerWallet.address, ephemeralPublicKey: mine.ephemeralPublicKey, metadata: metadata(mine.viewTag.slice(2)) });
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx });
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.payment.status, res.data.payment.stealth, res.data.payment.announced, res.data.payment.to], ['confirmed', true, true, mine.stealthAddress]);

  // the receipt names the one-time address, and the payee can list the payout; listing never
  // asks the node, so the balance is unknown until a lookup made on its own has read it
  chain.setBalance(mine.stealthAddress, intent.amount);
  chain.setEthBalance(mine.stealthAddress, '300000000000000');
  const asked = chain.calls.length;
  let payouts = (await mia('GET', '/api/stealth/payouts')).data.payouts;
  assert.equal(chain.calls.length, asked);
  assert.equal(payouts.length, 1);
  assert.deepEqual([payouts[0].address, payouts[0].ephemeralPublicKey, payouts[0].balance, payouts[0].announced], [mine.stealthAddress, mine.ephemeralPublicKey, null, true]);
  assert.equal((await sam('GET', '/api/stealth/payouts')).data.payouts.length, 0);

  // about to move it, the payee reads that one address now
  const now = await mia('GET', `/api/stealth/payouts/${payouts[0].id}/balance`);
  assert.deepEqual([now.status, now.data.balance.token, now.data.balance.eth], [200, intent.amount, '300000000000000']);
  assert.equal((await sam('GET', `/api/stealth/payouts/${payouts[0].id}/balance`)).status, 404);
  payouts = (await mia('GET', '/api/stealth/payouts')).data.payouts;
  assert.equal(payouts[0].balance.token, intent.amount);
  assert.ok(payouts[0].balanceCheckedAt <= Date.now());
});

test('a transfer to the payee’s public wallet doesn’t count as a private payout', async () => {
  const t = await bountyTask();
  const { intent } = (await startPrivate(t.id, oneTime(other))).data;
  const hash = tx();
  const miaPublic = (await owner('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.Mia).address;
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: miaPublic, value: intent.amount });
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx: tx() });
  assert.equal(res.data.payment.status, 'failed');
  assert.match(res.data.payment.problem, /private address/);
});

test('a wrong announcement leaves the payout unannounced until the payer sends a correct one', async () => {
  const t = await bountyTask();
  const derived = newStealthPayment(mine.meta, () => hexToBytes('44'.repeat(32)));
  const { intent } = (await startPrivate(t.id, derived)).data;
  const hash = tx();
  const badAnnounce = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: derived.address, value: intent.amount });
  chain.addAnnouncement({ hash: badAnnounce, announcer: ANNOUNCER, stealthAddress: derived.address, caller: ownerWallet.address, ephemeralPublicKey: mine.ephemeralPublicKey, metadata: metadata('00') });
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx: badAnnounce });
  assert.deepEqual([res.data.payment.status, res.data.payment.announced], ['confirmed', false]);

  const fixed = tx();
  chain.addAnnouncement({ hash: fixed, announcer: ANNOUNCER, stealthAddress: derived.address, caller: ownerWallet.address, ephemeralPublicKey: derived.ephemeralPublicKey, metadata: metadata(derived.viewTag.toString(16).padStart(2, '0')) });
  assert.equal((await mia('POST', `/api/payments/${res.data.payment.id}/announce`, { txHash: fixed })).status, 403);
  const again = await owner('POST', `/api/payments/${res.data.payment.id}/announce`, { txHash: fixed });
  assert.equal(again.data.payment.announced, true);
});

test('someone without private payouts on can’t be paid privately', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'For Sam', assigneeId: ids.Sam, bounty: BOUNTY })).data.task;
  const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth: newStealthPayment(mine.meta) });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /hasn’t turned on private payouts/);
});

test('the server takes a one-time address with public values only, and never one used before', async () => {
  const t = await bountyTask();
  const start = (stealth) => owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth });
  // the ephemeral private key is no longer something the server takes
  assert.equal((await start({ ephemeralKey: mine.ephemeralKey })).status, 400);
  const one = newStealthPayment(mine.meta);
  assert.equal((await start({ ...one, ephemeralPublicKey: `0x02${'f'.repeat(64)}` })).status, 400, 'not a point on the curve');
  assert.equal((await start({ ...one, viewTag: 256 })).status, 400);
  assert.equal((await start({ ...one, address: ownerWallet.address })).status, 400, 'a sign-in wallet');
  const first = await start(one);
  assert.equal(first.status, 200);
  assert.deepEqual([first.data.intent.to, first.data.intent.ephemeralPublicKey, first.data.intent.viewTag], [one.address, one.ephemeralPublicKey, one.viewTag]);
  // the same address or the same ephemeral key again would link two payouts
  assert.match((await start(one)).data.error, /already used/);
  assert.match((await start({ ...newStealthPayment(mine.meta), ephemeralPublicKey: one.ephemeralPublicKey })).data.error, /already used/);
  const fresh = await start(newStealthPayment(mine.meta));
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.data.intent.to, one.address);
});

test('the relay prepares and sends only transactions signed by the payee’s own one-time addresses', async () => {
  const prep = await mia('POST', '/api/stealth/prepare', { from: mine.stealthAddress, to: ownerWallet.address, data: '0x', value: '0' });
  assert.equal(prep.status, 200);
  assert.deepEqual([prep.data.chainId, prep.data.nonce, prep.data.gas, prep.data.balance], [1, 0, '26250', '300000000000000']);
  assert.equal((await sam('POST', '/api/stealth/prepare', { from: mine.stealthAddress, to: ownerWallet.address })).status, 403);
  assert.equal((await mia('POST', '/api/stealth/prepare', { from: ownerWallet.address, to: ownerWallet.address })).status, 403);

  const raw = signTx(mine.stealthKey, { to: ownerWallet.address, value: 1000n });
  const sent = await mia('POST', '/api/stealth/broadcast', { raw });
  assert.equal(sent.status, 200);
  assert.equal(chain.sent.at(-1), raw);

  assert.equal((await sam('POST', '/api/stealth/broadcast', { raw })).status, 403);
  assert.equal((await mia('POST', '/api/stealth/broadcast', { raw: signTx(`0x${'55'.repeat(32)}`, { to: ownerWallet.address }) })).status, 403);
  assert.equal((await mia('POST', '/api/stealth/broadcast', { raw: signTx(mine.stealthKey, { chainId: 5, to: ownerWallet.address }) })).status, 400);
  assert.equal((await mia('POST', '/api/stealth/broadcast', { raw: '0x02c0' })).status, 400);
  assert.equal((await mia('POST', '/api/stealth/broadcast', { raw: `${raw}00` })).status, 400);
});

test('a move out of a one-time address never offers a zero tip, even when the node suggests one', async () => {
  const fees = async () => (await mia('POST', '/api/stealth/prepare', { from: mine.stealthAddress, to: ownerWallet.address, data: '0x', value: '0' })).data;
  try {
    // the public node suggested exactly this when blocks had room
    chain.setPriorityFee(0n);
    const quiet = await fees();
    assert.equal(quiet.maxPriorityFeePerGas, '50000000');
    assert.equal(quiet.maxFeePerGas, String(2n * 1_000_000_000n + 50_000_000n));
    // a busier chain's suggestion above the floor is used as it is
    chain.setPriorityFee(2_000_000_000n);
    assert.equal((await fees()).maxPriorityFeePerGas, '2000000000');
  } finally {
    chain.setPriorityFee(100_000_000n);
  }
});

test('payout balances are read one address at a time, later, with another payee’s address mixed in', async () => {
  // Sam gets a private payout too, so there is someone else's address to mix in
  const samVector = VECTORS[2];
  assert.equal((await sam('PUT', '/api/me/stealth', { metaAddress: samVector.meta })).status, 200);
  const t = (await owner('POST', '/api/tasks', { title: 'For Sam, privately', assigneeId: ids.Sam, bounty: BOUNTY, status: 'done' })).data.task;
  const { intent } = (await startPrivate(t.id, oneTime(samVector))).data;
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: samVector.stealthAddress, value: intent.amount });
  assert.equal((await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx: tx() })).data.payment.status, 'confirmed');
  // long enough for every earlier lookup, which can land up to a window late, to go stale
  await new Promise((r) => setTimeout(r, 2100));

  const asked = chain.calls.length;
  const listed = (await mia('GET', '/api/stealth/payouts')).data.payouts;
  assert.ok(listed.length >= 2);
  assert.equal(chain.calls.length, asked, 'nothing is looked up while the list is served');
  await new Promise((r) => setTimeout(r, 1500));
  const looked = chain.calls.slice(asked).filter((c) => c.method === 'eth_getBalance').map((c) => c.params[0].toLowerCase());
  for (const p of listed) assert.ok(looked.includes(p.address), 'each of Mia’s addresses is read');
  assert.ok(looked.includes(samVector.stealthAddress.toLowerCase()), 'with Sam’s address mixed in');
  // each read asks for a single address: never a list of one person's addresses
  assert.ok(chain.calls.slice(asked).every((c) => !Array.isArray(c.params[0])));
});
