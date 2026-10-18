import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
const STAKING = '0xa94d6009790ba13597a1e1b7cf4e1531ea513613';
const TREASURY = '0x7777777777777777777777777777777777777777';
const NOX = 10n ** 18n;
const DAY = 86_400_000;
const HOUR = 3_600_000;

let srv;
let sql;
let plan;
let billingState;
let checkPerks;
let sendReminders;
let watchInvoices;
const chain = mockChain();
const base = () => srv.base;
const owner = client(base);
const admin = client(base);
const member = client(base);
const ownerWallet = wallet();
const adminWallet = wallet();
const memberWallet = wallet();
const ids = {};

before(async () => {
  // no pool and no manual rate: NOX can't be priced here, so invoices are USDC only
  srv = await startServer({ chain, env: { PLAN_TREASURY: TREASURY, PLAN_TREASURY_NAME: 'the NØNOS foundation treasury', PLAN_PRICE_USD: '20', PLAN_TRIAL_DAYS: '0', PLAN_STAKER_TIERS: '10000:10,100000:25', BURN_SHARE: '20', BURN_REPORT_URL: 'https://example.org/burns' } });
  ({ default: sql } = await import('../db/sql.js'));
  ({ default: plan } = await import('../services/plan.js'));
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: checkPerks } = await import('../jobs/checkPerks.js'));
  ({ default: sendReminders } = await import('../jobs/sendReminders.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  ids.owner = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const a = await owner('POST', '/api/invites', { role: 'admin' });
  ids.admin = (await admin.wallet(adminWallet, 'invite', { name: 'Ada', inviteToken: a.data.token })).data.user.id;
  const m = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(memberWallet, 'invite', { name: 'Mia', inviteToken: m.data.token })).data.user.id;
});
after(() => srv.close());

const quote = async () => (await owner('GET', '/api/plan/quote')).data;
// The scheduled checks run on this clock, `hours` apart, so each one is due when it runs. Each
// returns where the plan stands just after it.
let clock = Date.now();
const check = async (hours = 7) => {
  clock += hours * HOUR;
  await checkPerks(clock);
  return plan.status(clock + 1000);
};
const forgetChecks = () => sql.run("DELETE FROM billing_state WHERE key IN ('zsp', 'stakes', 'perkChecks')");

test('when NOX can’t be priced, invoices are offered in USDC only', async () => {
  const q = await quote();
  assert.deepEqual(q.tokens.map((t) => t.symbol), ['USDC']);
});

test('stakers get the discount of the highest tier one admin has held through the checks', async () => {
  assert.equal((await quote()).stakerPercent, 0);
  chain.setStake(ownerWallet.address, 10_000n * NOX);
  assert.equal((await quote()).stakerPercent, 0, 'a stake no check has seen yet earns nothing');
  await check();
  assert.equal((await quote()).stakerPercent, 0, 'nor one only a single check has seen');
  await check();
  let q = await quote();
  assert.deepEqual([q.stakerPercent, q.stakerUsd, q.totalUsd], [10, 2_000_000, 18_000_000]);

  // a member's stake doesn't count, and two admins can't pool theirs into a higher tier
  chain.setStake(memberWallet.address, 500_000n * NOX);
  chain.setStake(adminWallet.address, 95_000n * NOX);
  await check();
  await check();
  assert.equal((await quote()).stakerPercent, 10);
  chain.setStake(adminWallet.address, 100_000n * NOX);
  assert.equal((await quote()).stakerPercent, 10, 'the higher tier counts once the checks have seen it there');
  await check();
  await check();
  q = await quote();
  assert.deepEqual([q.stakerPercent, q.totalUsd], [25, 15_000_000]);

  // the discount is locked into the invoice, and a stake taken away counts at once
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  assert.deepEqual([invoice.price.stakerPercent, invoice.price.totalUsd], [25, 15_000_000]);
  chain.setStake(adminWallet.address, 0n);
  chain.setStake(ownerWallet.address, 0n);
  assert.equal((await quote()).stakerPercent, 0);
  assert.equal((await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice.price.stakerPercent, 25);
  await owner('POST', `/api/plan/invoices/${invoice.id}/cancel`);

  // a stake that is gone at one check starts over, even if it is back by the invoice
  chain.setStake(ownerWallet.address, 100_000n * NOX);
  await check();
  await check();
  chain.setStake(ownerWallet.address, 0n);
  await check();
  chain.setStake(ownerWallet.address, 100_000n * NOX);
  assert.equal((await quote()).stakerPercent, 0);
  chain.setStake(ownerWallet.address, 0n);
  chain.setStake(memberWallet.address, 0n);
});

test('a Zero-State Pass gives Pro once checks hours apart have found it, and ends it with no grace', async () => {
  // a member's pass doesn't count
  chain.setTokenBalance(ZSP, memberWallet.address, 1);
  assert.equal((await check()).unlocked, false);

  chain.setTokenBalance(ZSP, adminWallet.address, 1);
  assert.equal((await check()).unlocked, false, 'one check isn’t enough');
  let s = await check();
  assert.deepEqual([s.unlocked, s.active, s.source, s.zsp.active, s.seatLimit], [true, true, 'zsp', true, null]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Pro through a pass' })).status, 200);

  // not due again within half an interval of the last check
  chain.setTokenBalance(ZSP, adminWallet.address, 0);
  await checkPerks(clock + HOUR);
  assert.equal(plan.status(clock + HOUR + 1000).source, 'zsp');
  // the next check finds no pass: Pro ends right then, and the seat cap with it
  s = await check();
  assert.deepEqual([s.active, s.inGrace, s.unlocked, s.seatLimit], [false, false, false, 5]);
  chain.setTokenBalance(ZSP, memberWallet.address, 0);
  // the test clock runs ahead of the real one, where this perk's end is still to come
  forgetChecks();
});

test('a pass held for a quote, or for a single check, earns no Pro at all', async () => {
  const start = clock;
  chain.setTokenBalance(ZSP, ownerWallet.address, 1);
  assert.equal((await quote()).zsp, false);
  chain.setTokenBalance(ZSP, ownerWallet.address, 0);
  assert.equal((await check()).unlocked, false);
  assert.equal(plan.status(start + 6 * DAY).unlocked, false);

  chain.setTokenBalance(ZSP, ownerWallet.address, 1);
  await check();
  chain.setTokenBalance(ZSP, ownerWallet.address, 0);
  assert.equal((await check()).unlocked, false);
});

test('an unreachable node neither grants nor removes the pass perk, and the check runs again soon', async () => {
  chain.setTokenBalance(ZSP, ownerWallet.address, 1);
  await check();
  const granted = await check();
  assert.equal(granted.source, 'zsp');
  const before = billingState.get('zsp');
  chain.setTokenBalance(ZSP, ownerWallet.address, 0);
  const lift = chain.refuse((method, params) => method === 'eth_call' && params[0].to?.toLowerCase() === ZSP, { status: 503, error: { code: -32603, message: 'Service unavailable' } });
  try {
    await check();
    assert.equal(billingState.get('zsp').until, before.until);
  } finally {
    lift();
  }
  // still due a minute later, and that check sees the pass is gone
  clock += 60_000;
  await checkPerks(clock);
  assert.equal(plan.status(clock + 1000).unlocked, false);
  forgetChecks();
});

test('a staking or pass contract that reverts means no discount and no pass, never a failed invoice', async () => {
  chain.setStake(ownerWallet.address, 100_000n * NOX);
  chain.setTokenBalance(ZSP, ownerWallet.address, 1);
  chain.breakContract(STAKING);
  chain.breakContract(ZSP);
  try {
    const q = await quote();
    assert.deepEqual([q.stakerPercent, q.zsp], [0, false]);
    const made = await owner('POST', '/api/plan/invoices', {});
    assert.equal(made.status, 200, made.data.error);
    assert.equal(made.data.invoice.price.stakerPercent, 0);
    await owner('POST', `/api/plan/invoices/${made.data.invoice.id}/cancel`);
  } finally {
    chain.fixContract(STAKING);
    chain.fixContract(ZSP);
    chain.setStake(ownerWallet.address, 0n);
    chain.setTokenBalance(ZSP, ownerWallet.address, 0);
  }
});

test('admins are reminded 7 days and 1 day before Pro runs out, once each', async () => {
  const notes = async (who) => (await who('GET', '/api/notifications')).data.filter((n) => n.type === 'plan_ending');
  billingState.set('plan', { paidUntil: Date.now() + 6.5 * DAY, seatLimit: 5 });
  sendReminders();
  sendReminders();
  let mine = await notes(owner);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].data.days, 7);
  assert.equal((await notes(admin)).length, 1);
  assert.equal((await notes(member)).length, 0, 'only admins hear about billing');

  billingState.set('plan', { paidUntil: billingState.get('plan').paidUntil - 6 * DAY, seatLimit: 5 });
  sendReminders();
  sendReminders();
  mine = await notes(owner);
  assert.equal(mine.length, 2);
  assert.equal(mine[0].data.days, 1);

  // a new end date starts a new round; one far away sends nothing
  billingState.set('plan', { paidUntil: Date.now() + 40 * DAY, seatLimit: 5 });
  sendReminders();
  assert.equal((await notes(owner)).length, 2);
  // a server that was down sends only the nearest reminder, not every missed one
  billingState.set('plan', { paidUntil: Date.now() + 0.2 * DAY, seatLimit: 5 });
  sendReminders();
  mine = await notes(owner);
  assert.equal(mine.length, 3);
  assert.equal(mine[0].data.days, 1);
});

test('the revenue view shows what this workspace paid the treasury and the published burn share', async () => {
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const amount = invoice.amounts.find((a) => a.symbol === 'USDC').amount;
  chain.mine(1);
  chain.addTransfer({ hash: `0x${crypto.randomBytes(32).toString('hex')}`, token: USDC, from: wallet().address, to: TREASURY, value: amount, depth: 1 });
  chain.mine(3);
  await watchInvoices();
  const r = (await owner('GET', '/api/plan/revenue')).data;
  assert.equal(r.treasuryName, 'the NØNOS foundation treasury');
  assert.equal(r.burnShare, 20);
  assert.equal(r.burnReportUrl, 'https://example.org/burns');
  assert.deepEqual(r.tokens.map((t) => [t.symbol, t.amount]), [['USDC', amount]]);
  assert.equal(r.usd, Number(amount));
  assert.equal(r.burnUsd, Math.floor(Number(amount) / 5));
  assert.equal((await member('GET', '/api/plan/revenue')).status, 403);
});
