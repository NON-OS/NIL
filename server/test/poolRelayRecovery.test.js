import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import lyingNode from './helpers/lyingNode.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import poolChain from './helpers/poolChain.js';
import fakePoolServices from './helpers/fakePoolServices.js';
import withdrawalContext from '../pools/withdrawalContext.js';
import poolAbi from '../pools/poolAbi.js';
import newStealthPayment from '../../client/src/lib/stealth/newStealthPayment.ts';

// A relayer can send a pool payout's withdrawal and still report a failure, as 0xbow's testnet
// relayer did on Sepolia when its extra-gas swap reverted after the withdrawal was out. Nil then
// looks on-chain for the withdrawal and records it for the same payout, at once or later through
// Check for the payout. The node sits behind a liar, so a test can hand back logs the filter
// should have left out.
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BOUNTY = '250000000';
const SEARCH_BLOCKS = 10;
const FAILED = { status: 200, body: { success: false, error: 'execute reverted: AS', requestId: 'r1' } };
const [mine] = JSON.parse(fs.readFileSync(new URL('./fixtures/stealthVectors.json', import.meta.url)));
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;
const hex = (n) => `0x${n.toString(16)}`;
const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`;

const chain = mockChain();
let liar;
let services;
let srv;
let sql;
let pools;
const base = () => srv.base;
const owner = client(base);
// a second admin, since each one may make only so many relay requests a minute
const ana = client(base);
const mia = client(base);

before(async () => {
  chain.server.listen(0);
  await once(chain.server, 'listening');
  liar = await lyingNode(`http://127.0.0.1:${chain.server.address().port}`);
  services = await fakePoolServices();
  srv = await startServer({
    env: { NOX_RPC_URL: liar.url, PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url, PRIVACY_POOLS_SEARCH_BLOCKS: String(SEARCH_BLOCKS) },
  });
  ({ default: sql } = await import('../db/sql.js'));
  pools = poolChain(chain, { entrypoint: ENTRYPOINT, pool: POOL, token: USDC });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await mia.wallet(wallet(), 'invite', { name: 'Mia', inviteToken: inv.data.token });
  const adminInvite = await owner('POST', '/api/invites', { role: 'admin' });
  assert.equal((await ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: adminInvite.data.token })).status, 200);
  assert.equal((await mia('PUT', '/api/me/stealth', { metaAddress: mine.meta })).status, 200);
});
afterEach(() => {
  Object.assign(services.state, { relayAnswer: null, hangUp: false });
  liar.honest();
});
after(() => {
  services.close();
  srv.close();
  liar.close();
  chain.server.close();
});

async function poolPayout(admin = owner) {
  const miaId = (await mia('GET', '/api/bootstrap')).data.me.id;
  const task = (await admin('POST', '/api/tasks', { title: 'Private work', assigneeId: miaId, bounty: BOUNTY, bountyToken: 'USDC', status: 'done' })).data.task;
  const one = newStealthPayment(mine.meta);
  const { intent } = (await admin('POST', `/api/tasks/${task.id}/payments/intent`, { stealth: one, via: 'pool' })).data;
  const quote = (await admin('POST', `/api/pool-payouts/${intent.id}/quote`)).data.quote;
  const signals = ['11', '22', quote.gross, '33', '2', '44', '3', withdrawalContext(ENTRYPOINT, quote.withdrawalData, BigInt(quote.scope)).toString()];
  const proof = { pi_a: ['1', '2', '1'], pi_b: [['1', '2'], ['3', '4'], ['1', '0']], pi_c: ['5', '6', '1'] };
  const body = { withdrawal: { processooor: ENTRYPOINT, data: quote.withdrawalData }, publicSignals: signals, proof, feeCommitment: quote.feeCommitment };
  const relayLogs = (override) => pools.relayLogs({ to: one.address, gross: BigInt(quote.gross), fee: BigInt(quote.fee), override });
  const startBlock = sql.get('SELECT start_block FROM payment_intents WHERE id = ?', intent.id).start_block;
  return { admin, task, intent, quote, body, relayLogs, startBlock, to: one.address };
}

const relay = (p) => p.admin('POST', `/api/pool-payouts/${p.intent.id}/relay`, p.body);
const find = (p, who = p.admin) => who('POST', `/api/pool-payouts/${p.intent.id}/find`);
const recordedFor = (p) => sql.all('SELECT id, tx_hash FROM payments WHERE intent_id = ?', p.intent.id);
const searches = (since) => chain.calls.slice(since).filter((c) => c.method === 'eth_getLogs' && c.params[0].topics?.[0] === poolAbi.relayed).map((c) => c.params[0]);

test('a relay reported as failed whose withdrawal is on-chain is recorded, and credited once final', async () => {
  for (const answer of [FAILED, { status: 500, body: { error: 'Internal error' } }, 'hang up']) {
    const p = await poolPayout();
    // the withdrawal went out in the third search chunk after the payout was started
    chain.mine(2 * SEARCH_BLOCKS + 5);
    const hash = tx();
    chain.addLogs({ hash, logs: p.relayLogs(), depth: 1 });
    if (answer === 'hang up') services.state.hangUp = true;
    else services.state.relayAnswer = answer;
    const since = chain.calls.length;
    const res = await relay(p);
    Object.assign(services.state, { relayAnswer: null, hangUp: false });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.recovered, true);
    assert.deepEqual([res.data.payment.txHash, res.data.payment.state, res.data.payment.amount], [hash, 'confirming', p.intent.amount]);

    // read from the block the payout was started in, a chunk at a time, asking for this address
    const asked = searches(since);
    assert.equal(asked.length, 3);
    asked.forEach((q, i) => {
      assert.deepEqual([q.address, q.topics[2], Number(q.fromBlock)], [ENTRYPOINT, topic(p.to), p.startBlock + i * SEARCH_BLOCKS]);
      assert.ok(Number(q.toBlock) - Number(q.fromBlock) < SEARCH_BLOCKS);
    });

    chain.mine(3);
    const checked = (await owner('POST', `/api/payments/${res.data.payment.id}/check`)).data.payment;
    assert.deepEqual([checked.status, checked.state, checked.amount, checked.relayFee], ['confirmed', 'paid', p.intent.amount, p.quote.fee]);
    assert.equal((await owner('GET', '/api/bootstrap')).data.tasks.find((t) => t.id === p.task.id).bountyState, 'paid');
    // credited once: neither another relay nor a check records it again
    assert.equal((await relay(p)).status, 409);
    assert.equal((await find(p)).data.payment.id, checked.id);
    assert.deepEqual(recordedFor(p).map((r) => r.tx_hash), [hash]);
  }
});

test('a reported failure with nothing on-chain records nothing and passes the relayer’s words on', async () => {
  const p = await poolPayout();
  services.state.relayAnswer = FAILED;
  const res = await relay(p);
  assert.equal(res.status, 502);
  assert.match(res.data.error, /didn’t confirm sending the withdrawal: execute reverted: AS/);
  assert.match(res.data.error, /Check for the payout/);
  assert.equal(recordedFor(p).length, 0);
});

test('a relayed withdrawal to another address, or from another contract, is ignored', async () => {
  const p = await poolPayout(ana);
  const elsewhere = { hash: tx(), logs: p.relayLogs({ recipient: `0x${'12'.repeat(20)}` }) };
  const lookalike = { hash: tx(), logs: p.relayLogs({ entrypoint: `0x${'78'.repeat(20)}` }) };
  const removed = { hash: tx(), logs: p.relayLogs() };
  for (const t of [elsewhere, lookalike]) chain.addLogs({ ...t, depth: 1 });
  // a node that ignores the filter, and hands back a log a reorg took out as well
  const at = hex(chain.head());
  const forged = [elsewhere, lookalike, removed].flatMap((t) => t.logs.map((log, i) => ({ ...log, blockNumber: at, transactionHash: t.hash, logIndex: hex(i), removed: t === removed })));
  liar.lies((method, params) => (method === 'eth_getLogs' && params[0].topics?.[0] === poolAbi.relayed ? forged : undefined));

  services.state.relayAnswer = FAILED;
  assert.equal((await relay(p)).status, 502);
  assert.deepEqual((await find(p)).data, { payment: null });
  assert.equal(recordedFor(p).length, 0);
});

test('Check for the payout finds a withdrawal the relayer never confirmed, for the same payout', async () => {
  const p = await poolPayout(ana);
  services.state.hangUp = true;
  assert.equal((await relay(p)).status, 502);
  services.state.hangUp = false;
  const intents = () => sql.get('SELECT COUNT(*) AS n FROM payment_intents WHERE task_id = ?', p.task.id).n;
  const started = intents();

  // the admin reloads and checks before the withdrawal is mined
  assert.deepEqual((await find(p)).data, { payment: null });
  const hash = tx();
  chain.addLogs({ hash, logs: p.relayLogs(), depth: 1 });
  const found = (await find(p)).data.payment;
  assert.deepEqual([found.txHash, found.state, found.amount, found.via], [hash, 'confirming', p.intent.amount, 'pool']);
  // asking again gives the same payment back, and nothing new was started
  assert.equal((await find(p)).data.payment.id, found.id);
  assert.equal(intents(), started);
  assert.equal(recordedFor(p).length, 1);

  chain.mine(3);
  const checked = (await ana('POST', `/api/payments/${found.id}/check`)).data.payment;
  assert.deepEqual([checked.status, checked.state, checked.relayFee], ['confirmed', 'paid', p.quote.fee]);
  // a member can't look, even with the payout's id
  assert.equal((await find(p, mia)).status, 403);
});
