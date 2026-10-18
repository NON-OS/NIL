import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import poolChain from './helpers/poolChain.js';
import fakePoolServices from './helpers/fakePoolServices.js';
import withdrawalContext from '../pools/withdrawalContext.js';
import grossAmount from '../pools/grossAmount.js';
import poolAbi from '../pools/poolAbi.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';

// Paying a bounty from the team's Privacy Pools pool, end to end on the server: the intent, the
// relayer's quote, the checks before a relay, and the on-chain verification that credits it,
// against a mock chain and a fake relayer.
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BOUNTY = '250000000';
const [mine, outsider] = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';

let srv;
let services;
let pools;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const mia = client(base);

before(async () => {
  services = await fakePoolServices();
  srv = await startServer({ chain, env: { PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url } });
  pools = poolChain(chain, { entrypoint: ENTRYPOINT, pool: POOL, token: USDC });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await mia.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token });
  assert.equal((await mia('PUT', '/api/me/stealth', { metaAddress: mine.meta })).status, 200);
});
after(() => {
  services.close();
  srv.close();
});

async function poolIntent() {
  const miaId = (await mia('GET', '/api/bootstrap')).data.me.id;
  const task = (await owner('POST', '/api/tasks', { title: 'Private work', assigneeId: miaId, bounty: BOUNTY, bountyToken: 'USDC', status: 'done' })).data.task;
  // worked out as the admin's browser does; the server gets the address and public values only
  const one = newStealthPayment(mine.meta);
  const res = await owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: one, via: 'pool' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  chain.mine(6);
  return { task, intent: res.data.intent, to: one.address };
}

// What the browser sends after proving: the relayer's signed terms and signals that match them.
function relayBody(quote, change = {}) {
  const signals = ['11', '22', quote.gross, '33', '2', '44', '3', withdrawalContext(ENTRYPOINT, quote.withdrawalData, BigInt(quote.scope)).toString()];
  const proof = { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['5', '6', '1'], protocol: 'groth16', curve: 'bn128' };
  return { withdrawal: { processooor: ENTRYPOINT, data: quote.withdrawalData }, publicSignals: signals, proof, feeCommitment: quote.feeCommitment, ...change };
}

const quoteFor = async (intent) => (await owner('POST', `/api/pool-payouts/${intent.id}/quote`)).data.quote;

test('a pool payout goes to the one-time address, and the quote shows the fee before anything is sent', async () => {
  const { intent, to } = await poolIntent();
  assert.deepEqual([intent.to, intent.via, intent.stealth], [to, 'pool', true]);
  const quote = await quoteFor(intent);
  const gross = grossAmount(BigInt(intent.amount), 42n);
  assert.deepEqual([quote.feeBps, quote.gross, quote.fee], ['42', gross.toString(), (gross - BigInt(intent.amount)).toString()]);
  assert.equal(BigInt(quote.gross) - (BigInt(quote.gross) * 42n) / 10000n, BigInt(intent.amount));
  const asked = services.requests.at(-1);
  assert.deepEqual([asked.path, asked.body.recipient, asked.body.amount, asked.body.asset, asked.body.extraGas], ['/relayer/quote', to, intent.amount, USDC, true]);
  // nothing about the admin reaches the relayer: no cookie, no forwarded address
  assert.equal(asked.headers.cookie, undefined);
  assert.equal(asked.headers['x-forwarded-for'], undefined);
});

test('a relayed withdrawal is recorded at once and credited, net of the relayer fee, once final', async () => {
  const { intent, to, task } = await poolIntent();
  const quote = await quoteFor(intent);
  const hash = tx();
  services.state.txHash = hash;
  chain.addLogs({ hash, logs: pools.relayLogs({ to, gross: BigInt(quote.gross), fee: BigInt(quote.fee) }), depth: 1 });
  const res = await owner('POST', `/api/pool-payouts/${intent.id}/relay`, relayBody(quote));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  // in a block, but not a final one yet
  assert.deepEqual([res.data.payment.status, res.data.payment.state, res.data.payment.via], ['pending', 'confirming', 'pool']);
  const sent = services.requests.at(-1);
  assert.deepEqual([sent.path, sent.body.scope, sent.body.chainId, sent.body.withdrawal.processooor], ['/relayer/request', pools.scope.toString(), 1, ENTRYPOINT]);

  chain.mine(3);
  const checked = (await owner('POST', `/api/payments/${res.data.payment.id}/check`)).data.payment;
  assert.deepEqual([checked.status, checked.state, checked.amount, checked.from, checked.relayFee], ['confirmed', 'paid', intent.amount, ENTRYPOINT, quote.fee]);
  assert.equal((await owner('GET', '/api/bootstrap')).data.tasks.find((t) => t.id === task.id).bountyState, 'paid');
  // the contributor finds it among their private payouts, with no announcement to wait for
  const payout = (await mia('GET', '/api/stealth/payouts')).data.payouts.find((p) => p.address === to);
  assert.equal(payout.status, 'confirmed');
  // and a second relay for the same payout is refused
  assert.equal((await owner('POST', `/api/pool-payouts/${intent.id}/relay`, relayBody(quote))).status, 409);
});

test('a relay that would pay anyone else, or other terms, never reaches the relayer', async () => {
  const { intent } = await poolIntent();
  const quote = await quoteFor(intent);
  const before = services.requests.length;
  const other = `0x${'0'.repeat(24)}${'ab'.repeat(20)}${quote.withdrawalData.slice(66)}`;
  const cases = [
    relayBody(quote, { withdrawal: { processooor: `0x${'cd'.repeat(20)}`, data: quote.withdrawalData } }),
    relayBody(quote, { withdrawal: { processooor: ENTRYPOINT, data: other }, feeCommitment: { ...quote.feeCommitment, withdrawalData: other } }),
    relayBody(quote, { feeCommitment: { ...quote.feeCommitment, amount: '1' } }),
    { ...relayBody(quote), publicSignals: relayBody(quote).publicSignals.map((s, i) => (i === 2 ? String(BigInt(s) + 1n) : s)) },
    { ...relayBody(quote), publicSignals: relayBody(quote).publicSignals.map((s, i) => (i === 7 ? '12345' : s)) },
    { ...relayBody(quote), publicSignals: ['1', '2'] },
    { ...relayBody(quote), proof: { pi_a: ['x'] } },
  ];
  for (const body of cases) assert.equal((await owner('POST', `/api/pool-payouts/${intent.id}/relay`, body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal(services.requests.length, before);
  // terms the relayer signed for another address are refused at the quote
  services.state.otherRecipient = `0x${'ef'.repeat(20)}`;
  assert.equal((await owner('POST', `/api/pool-payouts/${intent.id}/quote`)).status, 502);
  services.state.otherRecipient = null;
});

test('a relayer refusal is passed on without control characters, and nothing is recorded', async () => {
  const { intent } = await poolIntent();
  const quote = await quoteFor(intent);
  services.state.refuse = true;
  const res = await owner('POST', `/api/pool-payouts/${intent.id}/relay`, relayBody(quote));
  services.state.refuse = false;
  assert.equal(res.status, 502);
  assert.match(res.data.error, /Relayer said no {2}politely/);
  assert.equal((await owner('GET', '/api/bounties')).data.payments.filter((p) => p.to === intent.to).length, 0);
});

// Records a transaction with these logs for a pool payout and returns the payment as checked.
async function recordWith(logs, { depth = 6 } = {}) {
  const { intent, to, task } = await poolIntent();
  const hash = tx();
  chain.addLogs({ hash, logs: typeof logs === 'function' ? logs(intent, to) : logs, depth });
  const res = await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { payment: res.data.payment, intent, to, hash };
}

const fee = 1000n;
const exact = (intent, to, override) => pools.relayLogs({ to, gross: BigInt(intent.amount) + fee, fee, override });

test('verification credits the exact amount net of the fee, and nothing else', async () => {
  assert.equal((await recordWith((i, to) => exact(i, to))).payment.state, 'paid');

  // short by one unit of the token: the suffix no longer matches
  const short = await recordWith((i, to) => pools.relayLogs({ to, gross: BigInt(i.amount) + fee - 1n, fee }));
  assert.equal(short.payment.status, 'failed');
  assert.match(short.payment.problem, /exactly/);

  // the relay names someone else
  const elsewhere = await recordWith((i, to) => exact(i, to, { recipient: `0x${'12'.repeat(20)}` }));
  assert.match(elsewhere.payment.problem, /relayed withdrawal from the USDC pool/);

  // tokens sent to the one-time address from some other wallet
  const direct = await recordWith((i, to) => [{ address: USDC, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', `0x${'34'.repeat(12).padStart(64, '0')}`, `0x${to.slice(2).padStart(64, '0')}`], data: `0x${BigInt(i.amount).toString(16).padStart(64, '0')}` }]);
  assert.equal(direct.payment.status, 'failed');

  // a withdrawal from another pool, a lookalike entry contract, a transfer of another token
  for (const override of [{ pool: `0x${'56'.repeat(20)}` }, { entrypoint: `0x${'78'.repeat(20)}` }, { token: `0x${'9a'.repeat(20)}` }]) {
    const forged = await recordWith((i, to) => exact(i, to, override));
    assert.equal(forged.payment.status, 'failed', JSON.stringify(override));
  }
  // the transfer doesn't match amount less fee
  const mismatched = await recordWith((i, to) => exact(i, to, { net: BigInt(i.amount) + 1n }));
  assert.equal(mismatched.payment.status, 'failed');
});

test('a pool payout is followed through finality and reorgs like any payment', async () => {
  const { payment, hash, intent, to } = await recordWith((i, to2) => exact(i, to2), { depth: 1 });
  assert.equal(payment.state, 'confirming');
  // reorganised out before it was final: kept and watched, not credited
  chain.drop(hash);
  let now = (await owner('POST', `/api/payments/${payment.id}/check`)).data.payment;
  assert.deepEqual([now.status, now.blockNumber], ['pending', null]);
  assert.match(now.problem, /reorganisation/);
  // mined again in a later block, then final
  chain.addLogs({ hash, logs: exact(intent, to), depth: 1 });
  now = (await owner('POST', `/api/payments/${payment.id}/check`)).data.payment;
  assert.equal(now.state, 'confirming');
  chain.mine(4);
  now = (await owner('POST', `/api/payments/${payment.id}/check`)).data.payment;
  assert.deepEqual([now.status, now.state], ['confirmed', 'paid']);
});

test('a payee known only by a registry meta-address isn’t paid from the pool, since nothing would announce it', async () => {
  const sam = client(base);
  const samWallet = wallet();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const samId = (await sam.wallet(samWallet, 'invite', { name: 'Sam', inviteToken: inv.data.token })).data.user.id;
  chain.setRegistered(samWallet.address, outsider.meta.slice('st:eth:0x'.length));
  const task = (await owner('POST', '/api/tasks', { title: 'For Sam', assigneeId: samId, bounty: BOUNTY, bountyToken: 'USDC', status: 'done' })).data.task;
  const res = await owner('POST', `/api/tasks/${task.id}/payments/intent`, { via: 'pool', stealth: newStealthPayment(outsider.meta) });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /private payouts on/);
  // from a wallet, with an announcement, the registry entry still works
  assert.equal((await owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: newStealthPayment(outsider.meta) })).status, 200);
});

test('a pool payout needs the contributor’s private payouts on and a pool for the token', async () => {
  const miaId = (await mia('GET', '/api/bootstrap')).data.me.id;
  const task = (await owner('POST', '/api/tasks', { title: 'More', assigneeId: miaId, bounty: BOUNTY, bountyToken: 'USDC', status: 'done' })).data.task;
  assert.equal((await owner('POST', `/api/tasks/${task.id}/payments/intent`, { via: 'pool' })).status, 400);
  assert.equal((await owner('POST', `/api/tasks/${task.id}/payments/intent`, { via: 'bank', stealth: newStealthPayment(mine.meta) })).status, 400);
  // the ephemeral private key is never something the server takes, for the pool either
  assert.equal((await owner('POST', `/api/tasks/${task.id}/payments/intent`, { via: 'pool', stealth: { ephemeralKey: mine.ephemeralKey } })).status, 400);
  // the entry contract answers zeros for a token it has no pool for, as it does for NOX today
  chain.answer(ENTRYPOINT, `0x${poolAbi.assetConfig}${NOX.slice(2).padStart(64, '0')}`, `0x${'0'.repeat(256)}`);
  const noxTask = (await owner('POST', '/api/tasks', { title: 'In NOX', assigneeId: miaId, bounty: BOUNTY, status: 'done' })).data.task;
  const res = await owner('POST', `/api/tasks/${noxTask.id}/payments/intent`, { via: 'pool', stealth: newStealthPayment(mine.meta) });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /no pool for NOX yet/);
  // members can't quote or relay, even with an intent id in hand
  const { intent, task: started } = await poolIntent();
  assert.equal((await mia('POST', `/api/pool-payouts/${intent.id}/quote`)).status, 403);
  assert.equal((await mia('POST', `/api/pool-payouts/${intent.id}/relay`, {})).status, 403);
  // and nobody records an announcement for a pool payout: it would have to come from a team wallet
  const announced = await owner('POST', `/api/tasks/${started.id}/payments`, { intentId: intent.id, txHash: tx(), announceTx: tx() });
  assert.equal(announced.status, 400);
  assert.match(announced.data.error, /isn’t announced/);
});
