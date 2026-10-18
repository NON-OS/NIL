import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import poolChain from './helpers/poolChain.js';
import poolAbi from '../pools/poolAbi.js';
import withdrawalContext from '../pools/withdrawalContext.js';
import fakePoolServices from './helpers/fakePoolServices.js';
import testVerifier from './helpers/testVerifier.js';
import verifierProxy from './helpers/verifierProxy.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';

// Pool payouts while chain reads are verified (NOX_VERIFIER_MODE=enforce): the pool comes from
// proven reads, and a relayed withdrawal counts only on a receipt Nil's verifier proved, under
// the same rules as any bounty payment.
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BOUNTY = '250000000';
const FEE = 1000n;
const [mine] = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

const chain = mockChain();
let v;
let proxy;
let services;
let srv;
let sql;
let pools;
let checkPayments;
let miaId;
const base = () => srv.base;
const owner = client(base);
const mia = client(base);

before(async () => {
  chain.server.listen(0);
  await once(chain.server, 'listening');
  const nodeUrl = `http://127.0.0.1:${chain.server.address().port}`;
  v = await testVerifier(nodeUrl);
  proxy = await verifierProxy(v.url, nodeUrl, testVerifier.KEY);
  services = await fakePoolServices();
  srv = await startServer({
    env: { NOX_RPC_URL: proxy.url, NOX_VERIFIER_MODE: 'enforce', NOX_VERIFIER_KEY: testVerifier.KEY, PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url },
  });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: checkPayments } = await import('../jobs/checkPayments.js'));
  pools = poolChain(chain, { entrypoint: ENTRYPOINT, pool: POOL, token: USDC });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  miaId = (await mia.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
  assert.equal((await mia('PUT', '/api/me/stealth', { metaAddress: mine.meta })).status, 200);
});
after(async () => {
  srv.close();
  services.close();
  proxy.close();
  await v.close();
  chain.server.close();
});

const payment = (id) => sql.get('SELECT status, problem, relay_fee FROM payments WHERE id = ?', id);
const poolTask = async () => (await owner('POST', '/api/tasks', { title: 'Private work', assigneeId: miaId, bounty: BOUNTY, bountyToken: 'USDC', status: 'done' })).data.task;
// a proven read, so the next test starts clean
const recover = async () => {
  proxy.set('through');
  v.client.lies = () => false;
  v.client.fails = () => null;
  await checkPayments();
};

// A pool payout the owner recorded for `hash`, a relayed withdrawal that really paid it. `mode`
// is how the app reaches its verifier from the moment the payment is recorded.
async function recorded(hash, { mode = 'through' } = {}) {
  const task = await poolTask();
  const one = newStealthPayment(mine.meta);
  const { intent } = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: one, via: 'pool' })).data;
  chain.mine(2);
  chain.addLogs({ hash, logs: pools.relayLogs({ to: one.address, gross: BigInt(intent.amount) + FEE, fee: FEE }), depth: 1 });
  chain.mine(4);
  proxy.set(mode);
  const res = await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash });
  return res.data.payment ?? sql.get('SELECT id FROM payments WHERE tx_hash = ?', hash);
}

test('a pool payout starts only on proven reads of the entry contract and the pool', async () => {
  const task = await poolTask();
  const start = () => owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: newStealthPayment(mine.meta), via: 'pool' });
  const lies = [(method, params) => method === 'eth_call' && params[0].to === ENTRYPOINT, (method, params) => method === 'eth_call' && params[0].to === POOL && params[0].data === `0x${poolAbi.scope}`];
  for (const lie of lies) {
    v.client.lies = lie;
    try {
      const res = await start();
      assert.equal(res.status, 502);
      assert.match(res.data.error, /couldn’t read the Privacy Pools contracts/);
    } finally {
      await recover();
    }
  }
  assert.equal(sql.get("SELECT COUNT(*) AS n FROM payment_intents WHERE via = 'pool'").n, 0);
  // nothing unproven was kept: with proven reads the same payout starts at once
  assert.equal((await start()).status, 200);
});

test('a relayed withdrawal on a proven receipt is credited, with what the relayer kept', async () => {
  const p = await recorded(tx());
  assert.deepEqual([payment(p.id).status, payment(p.id).relay_fee], ['confirmed', String(FEE)]);
});

test('a lying, unsealed or forged receipt never credits or fails a pool payout; it waits', async () => {
  for (const mode of ['lying', 'direct', 'forged']) {
    const hash = tx();
    if (mode === 'lying') v.client.lies = (method, params) => method === 'eth_getTransactionReceipt' && params[0] === hash;
    const p = await recorded(hash, { mode: mode === 'lying' ? 'through' : mode });
    try {
      await checkPayments();
      assert.deepEqual([payment(p.id).status, payment(p.id).relay_fee], ['pending', null], mode);
    } finally {
      await recover();
    }
    assert.equal(payment(p.id).status, 'confirmed', mode);
  }
});

test('a pool payout in a block older than the verifier can prove waits, saying so', async () => {
  const hash = tx();
  v.client.fails = (method, params) => (method === 'eth_getTransactionReceipt' && params[0] === hash ? new Error('block 1004 is outside EIP-2935 ring buffer range (latest: 9999, buffer size: 8191)') : null);
  try {
    const p = await recorded(hash);
    await checkPayments();
    const row = payment(p.id);
    assert.equal(row.status, 'pending');
    assert.match(row.problem, /older than Nil’s verifier can check/);
  } finally {
    await recover();
  }
});

test('a relay reported as failed is recovered from proven logs, and never from unproven ones', async () => {
  const task = await poolTask();
  const one = newStealthPayment(mine.meta);
  const { intent } = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: one, via: 'pool' })).data;
  const { quote } = (await owner('POST', `/api/pool-payouts/${intent.id}/quote`)).data;
  const signals = ['11', '22', quote.gross, '33', '2', '44', '3', withdrawalContext(ENTRYPOINT, quote.withdrawalData, BigInt(quote.scope)).toString()];
  const proof = { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['5', '6', '1'] };
  const body = { withdrawal: { processooor: ENTRYPOINT, data: quote.withdrawalData }, publicSignals: signals, proof, feeCommitment: quote.feeCommitment };
  const hash = tx();
  chain.mine(2);
  chain.addLogs({ hash, logs: pools.relayLogs({ to: one.address, gross: BigInt(quote.gross), fee: BigInt(quote.fee) }), depth: 1 });
  chain.mine(4);
  services.state.relayAnswer = { status: 200, body: { success: false, error: 'execute reverted: AS' } };
  try {
    // the same logs straight from the node, unsealed, count for nothing
    proxy.set('direct');
    const unproven = await owner('POST', `/api/pool-payouts/${intent.id}/relay`, body);
    assert.equal(unproven.status, 502);
    assert.match(unproven.data.error, /execute reverted: AS/);
    assert.equal(sql.get('SELECT COUNT(*) AS n FROM payments WHERE intent_id = ?', intent.id).n, 0);

    proxy.set('through');
    const res = await owner('POST', `/api/pool-payouts/${intent.id}/relay`, body);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual([res.data.recovered, res.data.payment.txHash], [true, hash]);
    assert.deepEqual([payment(res.data.payment.id).status, payment(res.data.payment.id).relay_fee], ['confirmed', quote.fee]);
    assert.ok(v.client.requests.some((r) => r.method === 'eth_getLogs' && r.params[0].topics[0] === poolAbi.relayed));
  } finally {
    services.state.relayAnswer = null;
    await recover();
  }
});
