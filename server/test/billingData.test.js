import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import bootProcess from './helpers/bootProcess.js';
import SETUP_TOKEN from './helpers/setupToken.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const DAY = 86_400_000;
const PASSPHRASE = 'correct horse capsule staple';

let srv;
let sql;
let watchInvoices;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const ownerWallet = wallet();
const paid = {};

before(async () => {
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  // an old workspace with a paid plan
  sql.run('UPDATE workspace SET created_at = ? WHERE id = 1', Date.now() - 100 * DAY);
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  paid.hash = `0x${crypto.randomBytes(32).toString('hex')}`;
  chain.mine(1);
  chain.addTransfer({ hash: paid.hash, token: USDC, from: ownerWallet.address, to: TREASURY, value: invoice.amounts.find((a) => a.symbol === 'USDC').amount, depth: 1 });
  chain.mine(3);
  await watchInvoices();
  paid.status = (await owner('GET', '/api/plan')).data;
  assert.equal(paid.status.source, 'paid');
});
after(() => srv.close());

async function exportCapsule() {
  const res = await fetch(`${base()}/api/export/capsule`, {
    method: 'POST',
    headers: { 'X-NONOS': '1', 'Content-Type': 'application/json', Cookie: owner.cookie() },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  });
  assert.equal(res.status, 200);
  return new Uint8Array(await res.arrayBuffer());
}

test('a capsule restored on another server brings the workspace but none of its billing', async () => {
  const capsule = await exportCapsule();
  const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-restore-'));
  // the other server has a 30-day trial; the capsule's own paid time must not come with it
  const other = await bootProcess({ dataDir: freshDir, env: { NOX_RPC_URL: process.env.NOX_RPC_URL, PLAN_TREASURY: TREASURY, PLAN_TRIAL_DAYS: '30', SETUP_TOKEN } });
  try {
    assert.ok(other.base, other.stderr());
    const there = client(() => other.base);
    const restored = await there('POST', '/api/auth/restore', capsule, { 'Content-Type': 'application/octet-stream', 'X-Capsule-Passphrase': Buffer.from(PASSPHRASE).toString('base64'), 'X-Setup-Token': SETUP_TOKEN });
    assert.equal(restored.status, 200);
    assert.equal((await there.wallet(ownerWallet, 'login')).status, 200);
    const s = (await there('GET', '/api/plan')).data;
    assert.equal(s.paidUntil, null, 'paid time stays with the server that was paid');
    // the trial here starts with the restore, not from the workspace's old creation date
    assert.equal(s.source, 'trial');
    assert.ok(Math.abs(s.lockAt - (Date.now() + 30 * DAY)) < 60_000);
    assert.deepEqual((await there('GET', '/api/plan/invoices')).data.invoices, []);
  } finally {
    await other.stop();
    fs.rmSync(freshDir, { recursive: true, force: true });
  }
});

test('erasing the workspace keeps the billing record, without who paid', async () => {
  assert.equal((await owner('POST', '/api/privacy/wipe', { confirm: 'NONOS' })).status, 200);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM users').n, 0);
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM billing_invoices').n, 1);
  assert.deepEqual({ ...sql.get('SELECT from_address, status FROM billing_payments WHERE tx_hash = ?', paid.hash) }, { from_address: null, status: 'final' });
  assert.equal(sql.get('SELECT created_by FROM billing_invoices').created_by, null);

  const again = client(base);
  await again.wallet(wallet(), 'setup', { name: 'Someone new', workspaceName: 'Fresh start' });
  const s = (await again('GET', '/api/plan')).data;
  // the server's paid time is still there; no trial was handed out again
  assert.deepEqual([s.source, s.paidUntil, s.trial], ['paid', paid.status.paidUntil, false]);

  // and the transaction that paid can't pay a new invoice
  const invoice = (await again('POST', '/api/plan/invoices', {})).data.invoice;
  const res = await again('POST', `/api/plan/invoices/${invoice.id}/transactions`, { txHash: paid.hash });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /already counted/);
});
