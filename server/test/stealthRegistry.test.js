import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';
import registerKeysCall from '../../client/src/lib/stealth/registerKeysCall.ts';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const ANNOUNCER = '0x55649e01b5df198d18d95b5cc5051630cfd45564';
const BOUNTY = (250n * 10n ** 18n).toString();
const [mine, other, third] = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
// the 66 bytes a wallet registers for a meta-address
const bytesOf = (meta) => meta.slice('st:eth:0x'.length);

let srv;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const people = {};

// registry reads the server asked the node for, for one wallet
const reads = (address) => chain.calls.filter((c) => c.method === 'eth_call' && c.params[0].to === chain.registry && c.params[0].data.includes(address.slice(2))).length;
const payee = async (id) => (await owner('GET', `/api/stealth/payees/${id}`)).data.stealth;
const later = (ms) => new Promise((r) => setTimeout(r, ms));

async function invite(name) {
  const w = wallet();
  const who = client(base);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const id = (await who.wallet(w, 'invite', { name, inviteToken: inv.data.token })).data.user.id;
  return (people[name] = { id, wallet: w, call: who });
}

// An outsider applies on the public board with only a wallet, and the owner takes them on.
async function applyAndAccept(w, name) {
  const task = (await owner('POST', '/api/tasks', { title: `Work for ${name}`, bounty: BOUNTY })).data.task;
  await owner('PATCH', `/api/tasks/${task.id}`, { listed: true });
  const post = (path, body) => fetch(`${base()}/api/public/bounties/${task.id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify(body) }).then((r) => r.json());
  const c = await post('challenge', { address: w.address, name, pitch: 'Did the same for two other teams.' });
  await post('apply', { challengeId: c.challengeId, signature: w.sign(c.message) });
  const [application] = (await owner('GET', `/api/tasks/${task.id}/applications`)).data;
  const accepted = (await owner('POST', `/api/applications/${application.id}/accept`)).data.task;
  await owner('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
  return accepted;
}

before(async () => {
  srv = await startServer({ chain, env: { STEALTH_REGISTRY_CACHE_SECONDS: '1' } });
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('an outsider from the public board is paid privately at the meta-address their wallet registered', async () => {
  const lucia = wallet();
  chain.setRegistered(lucia.address, bytesOf(other.meta));
  const task = await applyAndAccept(lucia, 'Lucia');
  assert.equal((await owner('GET', '/api/bootstrap')).data.stealth.registry, chain.registry);

  const found = await payee(task.assigneeId);
  assert.deepEqual(found, { metaAddress: other.meta, source: 'registry', problem: null });
  // stealthMetaAddressOf(Lucia's wallet, 1), asked of the registry contract
  const asked = chain.calls.find((c) => c.method === 'eth_call' && c.params[0].to === chain.registry);
  assert.equal(asked.params[0].data, `0x7aa8b5ad${lucia.address.slice(2).padStart(64, '0')}${'1'.padStart(64, '0')}`);
  const guest = client(base);
  await guest.wallet(lucia, 'login');
  assert.equal((await guest('GET', `/api/stealth/payees/${task.assigneeId}`)).status, 403);

  // the admin's browser works out the one-time address from that meta-address, as for anyone
  const one = { address: other.stealthAddress, ephemeralPublicKey: other.ephemeralPublicKey, viewTag: Number(other.viewTag) };
  const { intent } = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: one })).data;
  assert.deepEqual([intent.to, intent.stealth], [other.stealthAddress, true]);
  chain.mine(6);
  const hash = tx();
  const announceTx = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: other.stealthAddress, value: intent.amount });
  const metadata = `${other.viewTag.slice(2)}a9059cbb${NOX.slice(2)}${BigInt(intent.amount).toString(16).padStart(64, '0')}`;
  chain.addAnnouncement({ hash: announceTx, announcer: ANNOUNCER, stealthAddress: other.stealthAddress, caller: ownerWallet.address, ephemeralPublicKey: other.ephemeralPublicKey, metadata });
  const paid = (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash, announceTx })).data.payment;
  assert.deepEqual([paid.status, paid.stealth, paid.announced, paid.to], ['confirmed', true, true, other.stealthAddress]);
  assert.deepEqual((await guest('GET', '/api/stealth/payouts')).data.payouts.map((p) => p.address), [other.stealthAddress]);
});

test('a meta-address published in Nil comes first, and the registry isn’t asked', async () => {
  const mia = await invite('Mia');
  chain.setRegistered(mia.wallet.address, bytesOf(third.meta));
  assert.equal((await mia.call('PUT', '/api/me/stealth', { metaAddress: mine.meta })).status, 200);
  assert.deepEqual(await payee(mia.id), { metaAddress: mine.meta, source: 'nil', problem: null });
  assert.equal(reads(mia.wallet.address), 0);
});

test('a registry entry that isn’t a valid scheme 1 meta-address is refused', async () => {
  const spend = bytesOf(mine.meta).slice(0, 66);
  const entries = {
    short: bytesOf(mine.meta).slice(0, -2),
    long: `${bytesOf(mine.meta)}00`,
    offCurve: `${spend}02${'f'.repeat(64)}`,
    uncompressed: `04${bytesOf(mine.meta).slice(2)}`,
  };
  for (const [name, bytes] of Object.entries(entries)) {
    const who = await invite(`Ben ${name}`);
    chain.setRegistered(who.wallet.address, bytes);
    assert.deepEqual(await payee(who.id), { metaAddress: null, source: null, problem: 'invalid' }, name);
    const t = (await owner('POST', '/api/tasks', { title: `Paid ${name}`, assigneeId: who.id, bounty: BOUNTY })).data.task;
    const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth: newStealthPayment(mine.meta) });
    assert.equal(res.status, 400, name);
    assert.match(res.data.error, /isn’t a valid meta-address/);
  }
  // a valid meta-address under another scheme is not one Nil can pay
  const elsewhere = await invite('Ben elsewhere');
  chain.setRegistered(elsewhere.wallet.address, bytesOf(mine.meta), 2);
  assert.equal((await payee(elsewhere.id)).problem, 'none');
});

test('with nothing registered the private option stays unavailable, and says why', async () => {
  const sam = await invite('Sam');
  assert.deepEqual(await payee(sam.id), { metaAddress: null, source: null, problem: 'none' });
  const t = (await owner('POST', '/api/tasks', { title: 'For Sam', assigneeId: sam.id, bounty: BOUNTY })).data.task;
  const res = await owner('POST', `/api/tasks/${t.id}/payments/intent`, { stealth: newStealthPayment(mine.meta) });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /hasn’t turned on private payouts, and their wallet has no stealth meta-address/);
  // paying the public wallet still works
  assert.equal((await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).status, 200);
  assert.equal((await owner('GET', `/api/stealth/payees/${people.Mia.id}x`)).status, 404);
});

test('registry answers are kept briefly, a failed read isn’t kept, and your own check reads now', async () => {
  const ana = await invite('Ana');
  chain.setRegistered(ana.wallet.address, bytesOf(other.meta));
  assert.equal((await payee(ana.id)).metaAddress, other.meta);
  chain.setRegistered(ana.wallet.address, bytesOf(third.meta));
  assert.equal((await payee(ana.id)).metaAddress, other.meta, 'the first answer is kept');
  assert.equal(reads(ana.wallet.address), 1);
  await later(1100);
  assert.equal((await payee(ana.id)).metaAddress, third.meta);
  assert.equal(reads(ana.wallet.address), 2);

  // a node that doesn't answer is neither "nothing registered" nor kept as such
  await later(1100);
  const lift = chain.refuse((method, params) => method === 'eth_call' && params[0].to === chain.registry, { status: 503, error: { code: -32000, message: 'overloaded' } });
  assert.deepEqual(await payee(ana.id), { metaAddress: null, source: null, problem: 'unreadable' });
  lift();
  assert.equal((await payee(ana.id)).metaAddress, third.meta);

  // what you check for yourself skips what was kept
  chain.setRegistered(ana.wallet.address, '');
  const own = (await ana.call('GET', '/api/me/stealth/registry')).data.registry;
  assert.deepEqual(own, { wallet: ana.wallet.address, state: 'none', metaAddress: null });
});

test('a member reads back what their wallet sent to the registry', async () => {
  const kim = await invite('Kim');
  assert.equal((await kim.call('GET', '/api/me/stealth/registry')).data.registry.state, 'none');
  // the transaction Settings sends, mined by the mock registry as the contract would keep it
  assert.ok(chain.registerKeys(kim.wallet.address, registerKeysCall(mine.meta)));
  assert.deepEqual((await kim.call('GET', '/api/me/stealth/registry')).data.registry, { wallet: kim.wallet.address, state: 'found', metaAddress: mine.meta });
  assert.equal((await payee(kim.id)).source, 'registry');
  assert.equal((await client(base)('GET', '/api/me/stealth/registry')).status, 401);
});
