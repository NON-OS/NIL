import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import until from './helpers/until.js';
import bootProcess from './helpers/bootProcess.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// The real server in its own process, killed without warning between the steps of a payment, the
// way a crash or an out-of-memory kill would stop it, then started again on the same data. Each
// time it has to pick up where it was on its own, with the payments job running every second.
const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

const chain = mockChain();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-restart-'));
const env = { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_USD: '0.05', PLAN_INVOICES_PER_DAY: '40', JOB_PAYMENTS_SECONDS: '1', SETUP_TOKEN };
let proc = null;
const owner = client(() => proc.base);
const member = client(() => proc.base);
const ownerWallet = wallet();
const memberWallet = wallet();

before(async () => {
  chain.server.listen(0, '127.0.0.1');
  await once(chain.server, 'listening');
  env.NOX_RPC_URL = `http://127.0.0.1:${chain.server.address().port}`;
});
after(async () => {
  if (proc) await proc.stop('SIGKILL');
  chain.server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function boot(dir = dataDir, extra = {}) {
  // a test that failed halfway may have left its server running
  if (proc) await crash();
  proc = await bootProcess({ dataDir: dir, env: { ...env, ...extra } });
  assert.ok(proc.base, proc.stderr());
}
// no clean shutdown: whatever step was running is cut off where it was
async function crash() {
  await proc.stop('SIGKILL');
  proc = null;
}
// The database while no server runs, to look at it or to leave it the way a step cut off halfway
// would have.
function offline(fn) {
  const db = new DatabaseSync(path.join(dataDir, 'nonos.db'));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const invoice = async (id) => (await owner('GET', `/api/plan/invoices/${id}`)).data.invoice;

test('a Nil Pro payment survives a crash between every step, from naming it to Pro being added', async () => {
  await boot();
  assert.equal((await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).status, 200);
  const made = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const amount = made.amounts.find((a) => a.symbol === 'USDC').amount;
  const hash = tx();
  assert.equal((await owner('POST', `/api/plan/invoices/${made.id}/transactions`, { txHash: hash })).data.invoice.state, 'seen');
  await crash();

  // mined while the server was down
  chain.addTransferAt({ hash, token: USDC, from: ownerWallet.address, to: TREASURY, value: amount, atBlock: chain.head() + 1 });
  chain.mine(1);
  await boot();
  await until(async () => (await invoice(made.id)).state === 'confirming', { what: 'the payment to be found again' });
  await crash();

  // the block became final, and the server was cut off right after counting the payment and
  // before settling its invoice
  chain.mine(3);
  offline((db) => db.prepare("UPDATE billing_payments SET status = 'final', on_time = 1, usd = ?, final_at = ? WHERE tx_hash = ?").run(Number(amount), Date.now(), hash));
  assert.equal(offline((db) => db.prepare('SELECT status FROM billing_invoices WHERE id = ?').get(made.id).status), 'open');
  // and before it saved how far the treasury scan got
  offline((db) => db.prepare("DELETE FROM billing_state WHERE key = 'scan'").run());
  await boot();
  await until(async () => (await invoice(made.id)).status === 'paid', { what: 'the invoice to be settled' });
  const plan = (await owner('GET', '/api/plan')).data;
  assert.equal(plan.source, 'paid');
  await crash();
  assert.equal(offline((db) => db.prepare('SELECT COUNT(*) AS n FROM billing_payments WHERE tx_hash = ?').get(hash).n), 1, 'the scan read the past again and counted nothing twice');
});

test('an invoice that credit paid in full is settled after a crash right after it was made', async () => {
  // what making it leaves behind when the server stops before settling it
  offline((db) => {
    const now = Date.now();
    db.prepare("INSERT INTO billing_invoices (id, number, kind, periods, people, seats, base_usd, seats_usd, staker_percent, staker_usd, total_usd, credit_usd, due_usd, nox_percent, zsp, suffix, start_block, status, created_at, expires_at) VALUES ('creditonly', 99, 'periods', 1, 5, 0, 10000000, 0, 0, 0, 10000000, 10000000, 0, 20, 0, 1, 1, 'open', ?, ?)").run(now, now + 3_600_000);
  });
  await boot();
  await until(async () => (await invoice('creditonly')).status === 'paid', { what: 'the credit-only invoice to be settled' });
  await crash();
});

test('a bounty payment recorded just before a crash is checked again after the restart', async () => {
  await boot();
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  const memberId = (await member.wallet(memberWallet, 'invite', { name: 'Mia', inviteToken: inv.data.token })).data.user.id;
  const task = (await owner('POST', '/api/tasks', { title: 'Restart work', assigneeId: memberId, bounty: String(10n ** 18n) })).data.task;
  const intent = (await owner('POST', `/api/tasks/${task.id}/payments/intent`, {})).data.intent;
  const hash = tx();
  const payment = (await owner('POST', `/api/tasks/${task.id}/payments`, { intentId: intent.id, txHash: hash })).data.payment;
  assert.equal(payment.status, 'pending');
  await crash();

  chain.addTransferAt({ hash, token: NOX, from: ownerWallet.address, to: intent.to, value: intent.amount, atBlock: chain.head() + 1 });
  chain.mine(4);
  await boot();
  await until(async () => (await owner('GET', `/api/tasks/${task.id}/detail`)).data.task.bountyState === 'paid', { what: 'the bounty to be paid' });
  await crash();
});

test('with no token that can be priced, a quote still answers and an invoice is refused without a server error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-unpriced-'));
  try {
    await boot(dir, { PLAN_USDC: 'off', PLAN_NOX_USD: '' });
    const alone = client(() => proc.base);
    await alone.wallet(wallet(), 'setup', { name: 'Solo', workspaceName: 'Solo' });
    const q = await alone('GET', '/api/plan/quote');
    assert.deepEqual([q.status, q.data.tokens], [200, []]);
    const made = await alone('POST', '/api/plan/invoices', {});
    assert.equal(made.status, 409);
    assert.match(made.data.error, /No token can be priced right now/);
    await crash();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
