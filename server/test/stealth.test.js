import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import signTx from './helpers/signTx.js';
import stealthAddress from '../stealth/stealthAddress.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
const BOUNTY = (250n * 10n ** 18n).toString();
const VECTORS = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const [mine, other] = VECTORS;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
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
  srv = await startServer({ chain });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  for (const [who, name] of [[mia, 'Mia'], [sam, 'Sam']]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[name] = (await who.wallet(wallet(), 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

const bountyTask = async () => (await owner('POST', '/api/tasks', { title: 'Private work', assigneeId: ids.Mia, bounty: BOUNTY, status: 'done' })).data.task;
// Starts a private payout in Nil with the payer's one-time key, then lets blocks pass so the
// transfers added next land after it and are final.
async function startPrivate(taskId, ephemeralKey) {
  const res = await owner('POST', `/api/tasks/${taskId}/payments/intent`, { stealth: { ephemeralKey } });
  chain.mine(6);
  return res;
}

test('stealth addresses match the ERC-5564 reference implementation byte for byte', () => {
  for (const v of VECTORS) {
    const got = stealthAddress(v.meta, v.ephemeralKey);
    assert.equal(got.address, v.stealthAddress);
    assert.equal(got.ephemeralPublicKey, v.ephemeralPublicKey);
    assert.equal(`0x${got.viewTag.toString(16).padStart(2, '0')}`, v.viewTag);
  }
});

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
  const { intent } = (await startPrivate(t.id, mine.ephemeralKey)).data;
  // the one-time address is derived on the server from the key, exactly as the reference does
  assert.deepEqual([intent.to, intent.stealth, intent.ephemeralPublicKey], [mine.stealthAddress, true, mine.ephemeralPublicKey]);
  const hash = tx();
  const announceTx = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: mine.stealthAddress, value: intent.amount });
  chain.addAnnouncement({ hash: announceTx, announcer: ANNOUNCER, stealthAddress: mine.stealthAddress, caller: ownerWallet.address, ephemeralPublicKey: mine.ephemeralPublicKey, metadata: metadata(mine.viewTag.slice(2)) });
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx });
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.payment.status, res.data.payment.stealth, res.data.payment.announced, res.data.payment.to], ['confirmed', true, true, mine.stealthAddress]);

  // the receipt names the one-time address, and the payee can list the payout with its balance
  chain.setBalance(mine.stealthAddress, intent.amount);
  chain.setEthBalance(mine.stealthAddress, '300000000000000');
  const payouts = (await mia('GET', '/api/stealth/payouts')).data.payouts;
  assert.equal(payouts.length, 1);
  assert.deepEqual([payouts[0].address, payouts[0].ephemeralPublicKey, payouts[0].balance.token, payouts[0].announced], [mine.stealthAddress, mine.ephemeralPublicKey, intent.amount, true]);
  assert.equal((await sam('GET', '/api/stealth/payouts')).data.payouts.length, 0);
});

test('a transfer to the payee’s public wallet doesn’t count as a private payout', async () => {
  const t = await bountyTask();
  const { intent } = (await startPrivate(t.id, other.ephemeralKey)).data;
  const hash = tx();
  const miaPublic = (await owner('GET', '/api/bootstrap')).data.users.find((u) => u.id === ids.Mia).address;
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: miaPublic, value: intent.amount });
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: intent.id, txHash: hash, announceTx: tx() });
  assert.equal(res.data.payment.status, 'failed');
  assert.match(res.data.payment.problem, /private address/);
});

test('a wrong announcement leaves the payout unannounced until the payer sends a correct one', async () => {
  const t = await bountyTask();
  const eph = `0x${'44'.repeat(32)}`;
  const derived = stealthAddress(mine.meta, eph);
  const { intent } = (await startPrivate(t.id, eph)).data;
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
  const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth: { ephemeralKey: mine.ephemeralKey } });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /hasn’t turned on private payouts/);
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
