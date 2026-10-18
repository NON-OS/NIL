import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import testVerifier from './helpers/testVerifier.js';
import verifierProxy from './helpers/verifierProxy.js';
import lyingNode from './helpers/lyingNode.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const UNIT = 10n ** 18n;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

// The app reads a node that may lie (NOX_RPC_URL); the verifier reads the honest chain behind it.
const chain = mockChain();
let nodeUrl;
let v;
let liar;
let toVerifier;
let srv;
let sql;
let checkPayments;
let shadowCheck;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ownerWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  chain.server.listen(0);
  await once(chain.server, 'listening');
  nodeUrl = `http://127.0.0.1:${chain.server.address().port}`;
  v = await testVerifier(nodeUrl);
  liar = await lyingNode(nodeUrl);
  toVerifier = await verifierProxy(v.url, nodeUrl, testVerifier.KEY);
  srv = await startServer({
    env: { NOX_RPC_URL: liar.url, NOX_VERIFIER_MODE: 'shadow', NOX_VERIFIER_KEY: testVerifier.KEY, NOX_VERIFIER_URL: toVerifier.url, NOX_MISSING_TX_HOURS: '1' },
  });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: checkPayments } = await import('../jobs/checkPayments.js'));
  ({ default: shadowCheck } = await import('../chain/shadowCheck.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Jane Doe', inviteToken: inv.data.token })).data.user.id;
});
after(async () => {
  await shadowCheck.idle();
  srv.close();
  toVerifier.close();
  liar.close();
  await v.close();
  chain.server.close();
});

const verification = async () => (await owner('GET', '/api/bootstrap')).data.nox.verification;
const status = (id) => sql.get('SELECT status FROM payments WHERE id = ?', id).status;
async function intent() {
  const t = (await owner('POST', '/api/tasks', { title: 'Bounty work', assigneeId: ids.member, bounty: (10n * UNIT).toString() })).data.task;
  return { task: t, intent: (await owner('POST', `/api/tasks/${t.id}/payments/intent`, {})).data.intent };
}
async function record(t, i, hash) {
  const res = await owner('POST', `/api/tasks/${t.id}/payments`, { intentId: i.id, txHash: hash });
  await shadowCheck.idle();
  return res.data.payment ?? sql.get('SELECT id FROM payments WHERE tx_hash = ?', hash);
}
async function receipt(hash) {
  const res = await fetch(nodeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }) });
  return (await res.json()).result;
}
// error lines the server writes while `work` runs
async function errorsDuring(work) {
  const lines = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return write(chunk, ...rest);
  };
  try {
    await work();
  } finally {
    process.stderr.write = write;
  }
  return lines.filter((l) => l.includes('ERROR'));
}

test('an honest node: payments settle as before, every answer checks out, admins see no notice', async () => {
  const { task, intent: i } = await intent();
  chain.mine(2);
  const hash = tx();
  chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: i.to, value: i.amount, depth: 1 });
  chain.mine(4);
  const p = await record(task, i, hash);
  assert.equal(status(p.id), 'confirmed');
  const state = await verification();
  assert.equal(state.mode, 'shadow');
  assert.equal(state.ok, true);
  assert.ok(state.lastProven, 'the shadow checks proved the answers the app used');
});

test('with the verifier unreachable nothing waits and nothing is flagged; it is only logged', async () => {
  toVerifier.set('down');
  try {
    const { task, intent: i } = await intent();
    chain.mine(2);
    const hash = tx();
    chain.addTransfer({ hash, token: NOX, from: ownerWallet.address, to: i.to, value: i.amount, depth: 1 });
    chain.mine(4);
    assert.equal(status((await record(task, i, hash)).id), 'confirmed');
    assert.equal((await verification()).ok, true);
  } finally {
    toVerifier.set('through');
  }
});

test('a missing transaction still fails after NOX_MISSING_TX_HOURS, as it does without a verifier', async () => {
  const { task, intent: i } = await intent();
  const p = await record(task, i, tx());
  sql.run('UPDATE payments SET created_at = ? WHERE id = ?', Date.now() - 2 * 3_600_000, p.id);
  await checkPayments();
  assert.equal(status(p.id), 'failed');
});

test('a lying node’s receipt is still acted on, as before, but raises the notice, the health flag and an error line', async () => {
  const { task, intent: i } = await intent();
  chain.mine(2);
  // a real transfer in the block, which the liar passes off as a different transaction
  const real = tx();
  chain.addTransfer({ hash: real, token: NOX, from: ownerWallet.address, to: i.to, value: i.amount, depth: 1 });
  chain.mine(4);
  const fake = tx();
  const copied = await receipt(real);
  liar.lies((method, params) => (method === 'eth_getTransactionReceipt' && params[0] === fake ? { ...copied, transactionHash: fake, logs: copied.logs.map((l) => ({ ...l, transactionHash: fake })) } : undefined));
  let p;
  const errors = await errorsDuring(async () => {
    p = await record(task, i, fake);
  });
  liar.honest();
  // shadow mode changes nothing about what the app does
  assert.equal(status(p.id), 'confirmed');
  const state = await verification();
  assert.equal(state.ok, false);
  assert.equal(state.reason, 'mismatch');
  assert.ok(state.mismatchAt);
  assert.ok(errors.some((l) => /eth_getTransactionReceipt with something Nil’s verifier proved false/.test(l)), errors.join('\n'));
  assert.ok(!errors.some((l) => l.includes(fake)), 'the hash stays out of the log');
  const text = await (await fetch(`${srv.base}/healthz`)).text();
  assert.equal(JSON.parse(text).chain.verification.mismatchAt, state.mismatchAt);
  // Docker keeps 4 KB of a health check's output, which is where the control plane reads this
  assert.ok(Buffer.byteLength(text) < 4096, `${Buffer.byteLength(text)} bytes`);
});

test('a lying node’s balance still opens the holder door, as before, and is caught', async () => {
  const before = (await verification()).mismatchAt;
  assert.equal((await owner('PUT', '/api/holder-gate', { enabled: true, minimum: (1000n * UNIT).toString() })).status, 200);
  const whale = wallet();
  const arg = whale.address.slice(2).toLowerCase();
  liar.lies((method, params) => (method === 'eth_call' && params[0].data === `0x70a08231${arg.padStart(64, '0')}` ? `0x${(5000n * UNIT).toString(16).padStart(64, '0')}` : undefined));
  try {
    assert.equal((await client(base).wallet(whale, 'holder', { name: 'Whale' })).status, 200);
    await shadowCheck.idle();
  } finally {
    liar.honest();
  }
  const after = (await verification()).mismatchAt;
  assert.ok(Date.parse(after) > Date.parse(before), `${after} after ${before}`);
});
