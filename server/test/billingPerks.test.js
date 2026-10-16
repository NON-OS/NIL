import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const ZSP = '0x7b575dd8e8b111c52ab1e872924d4efd4df403df';
const TREASURY = '0x7777777777777777777777777777777777777777';
const NOX = 10n ** 18n;
const DAY = 86_400_000;
const HOUR = 3_600_000;

let srv;
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

test('when NOX can’t be priced, invoices are offered in USDC only', async () => {
  const q = await quote();
  assert.deepEqual(q.tokens.map((t) => t.symbol), ['USDC']);
});

test('stakers get the discount of the highest tier any one admin reaches', async () => {
  assert.equal((await quote()).stakerPercent, 0);
  chain.setStake(ownerWallet.address, 10_000n * NOX);
  let q = await quote();
  assert.deepEqual([q.stakerPercent, q.stakerUsd, q.totalUsd], [10, 2_000_000, 18_000_000]);
  // a member's stake doesn't count, and two admins can't pool theirs into a higher tier
  chain.setStake(memberWallet.address, 500_000n * NOX);
  chain.setStake(adminWallet.address, 95_000n * NOX);
  q = await quote();
  assert.equal(q.stakerPercent, 10);
  chain.setStake(adminWallet.address, 100_000n * NOX);
  q = await quote();
  assert.deepEqual([q.stakerPercent, q.totalUsd], [25, 15_000_000]);
  // the discount is locked into the invoice
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  assert.deepEqual([invoice.price.stakerPercent, invoice.price.totalUsd], [25, 15_000_000]);
  chain.setStake(adminWallet.address, 0n);
  chain.setStake(ownerWallet.address, 0n);
  assert.equal((await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice.price.stakerPercent, 25);
  await owner('POST', `/api/plan/invoices/${invoice.id}/cancel`);
});

test('a Zero-State Pass held by an admin gives the workspace Pro, re-checked on a schedule', async () => {
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);
  // a member's pass doesn't count
  chain.setTokenBalance(ZSP, memberWallet.address, 1);
  await checkPerks();
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);

  chain.setTokenBalance(ZSP, adminWallet.address, 1);
  billingState.set('zsp', { ...billingState.get('zsp'), checkedAt: Date.now() - 7 * HOUR });
  await checkPerks();
  let s = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([s.unlocked, s.active, s.source, s.zsp.active, s.seatLimit], [true, true, 'zsp', true, null]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'Pro through a pass' })).status, 200);

  // not due again yet: selling the pass shows up at the next scheduled check
  chain.setTokenBalance(ZSP, adminWallet.address, 0);
  await checkPerks();
  assert.equal((await owner('GET', '/api/plan')).data.source, 'zsp');
  billingState.set('zsp', { ...billingState.get('zsp'), checkedAt: Date.now() - 7 * HOUR });
  await checkPerks();
  s = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([s.active, s.inGrace, s.unlocked], [false, true, true], 'the grace period follows, like after any lapse');

  // the quote, which runs whenever an invoice is made, checks again on the spot
  chain.setTokenBalance(ZSP, ownerWallet.address, 2);
  assert.equal((await quote()).zsp, true);
  assert.equal((await owner('GET', '/api/plan')).data.source, 'zsp');
});

test('an unreachable node neither grants nor removes the pass perk', async () => {
  const before = billingState.get('zsp');
  chain.breakContract(ZSP);
  billingState.set('zsp', { ...before, checkedAt: Date.now() - 7 * HOUR });
  await checkPerks();
  assert.equal(billingState.get('zsp').until, before.until);
  chain.fixContract(ZSP);
  chain.setTokenBalance(ZSP, ownerWallet.address, 0);
  billingState.set('zsp', { until: Date.now() - 30 * DAY, checkedAt: Date.now() - 7 * HOUR });
  await checkPerks();
  assert.equal((await owner('GET', '/api/plan')).data.unlocked, false);
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
