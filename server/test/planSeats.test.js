import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TREASURY = '0x7777777777777777777777777777777777777777';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const tx = () => `0x${crypto.randomBytes(32).toString('hex')}`;

let srv;
let billingState;
let watchInvoices;
const chain = mockChain();
const owner = client(() => srv.base);

before(async () => {
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: TREASURY, PLAN_PRICE_USD: '12', PLAN_SEAT_USD: '3', PLAN_FREE_SEATS: '5', PLAN_TRIAL_DAYS: '14', PLAN_GRACE_DAYS: '7', PLAN_NOX_USD: '0.05', PLAN_INVOICES_PER_DAY: '40' },
  });
  ({ default: billingState } = await import('../billing/billingState.js'));
  ({ default: watchInvoices } = await import('../jobs/watchInvoices.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Owner', workspaceName: 'Seats' });
});
after(() => srv.close());

const make = async (body) => {
  const res = await owner('POST', '/api/plan/invoices', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.invoice;
};
const payExact = async (invoice) => {
  const usdc = invoice.amounts.find((a) => a.symbol === 'USDC');
  chain.mine(1);
  chain.addTransfer({ hash: tx(), token: USDC, from: wallet().address, to: TREASURY, value: usdc.amount, depth: 1 });
  chain.mine(3);
  await watchInvoices();
  return (await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice;
};
const join = async (n, prefix) => {
  for (let i = 0; i < n; i++) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    assert.equal(inv.status, 200, JSON.stringify(inv.data));
    assert.equal((await client(() => srv.base).wallet(wallet(), 'invite', { name: `${prefix}${i}`, inviteToken: inv.data.token })).status, 200);
  }
};
// moves every stored time in the plan back, as if that much time had passed
const age = (ms) => {
  const stored = billingState.get('plan', {});
  billingState.set('plan', { ...stored, paidUntil: stored.paidUntil - ms, seatSteps: stored.seatSteps.map((s) => ({ ...s, from: s.from - ms })) });
};

test('people who came in during the trial pause the paid tools until their seats are paid for', async () => {
  const bought = await make({ periods: 24, people: 5 });
  assert.equal((await payExact(bought)).state, 'paid');

  // the trial leaves the door open, so twenty more come in
  assert.equal((await owner('GET', '/api/plan')).data.seatLimit, null);
  await join(20, 'T');

  // the trial ends with 21 people on a plan bought for 5
  const start = billingState.get('trialStart');
  billingState.set('trialStart', start - 15 * DAY);
  age(15 * DAY);
  const over = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([over.source, over.seatLimit, over.seatsUsed, over.overSeats, over.unlocked], ['paid', 5, 21, true, false]);
  const refused = await owner('POST', '/api/proposals', { title: 'A paid tool' });
  assert.equal(refused.status, 402);
  assert.match(refused.data.error, /covers 5 people and 21 are here/);

  // seats for everyone, priced for all the paid time left, open the tools again
  const seats = await make({ kind: 'seats', people: 21 });
  assert.ok(seats.price.seatsUsd > 16 * 3_000_000 * 23, 'sixteen seats for about 24 periods');
  assert.equal((await payExact(seats)).state, 'paid');
  const fixed = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([fixed.seatLimit, fixed.overSeats, fixed.unlocked], [21, false, true]);
  assert.equal((await owner('POST', '/api/proposals', { title: 'A paid tool' })).status, 200);
});

test('seats bought for the last hours of a period end with it, whatever a renewal says', async () => {
  // a plan for 21 people with two hours left
  billingState.set('plan', { paidUntil: Date.now() + 2 * HOUR, seatSteps: [{ from: 0, seats: 21 }] });

  const seats = await make({ kind: 'seats', people: 521 });
  assert.ok(seats.price.totalUsd < 5_000_000, 'cheap, since it only covers two hours');
  assert.equal((await payExact(seats)).state, 'paid');
  assert.equal((await owner('GET', '/api/plan')).data.seatLimit, 521);

  // a renewal for the people actually here
  const renewal = await make({ periods: 24, people: 21 });
  assert.equal((await payExact(renewal)).state, 'paid');
  await join(3, 'R');
  assert.equal((await owner('GET', '/api/plan')).data.seatLimit, 521, 'the two hours bought are still running');

  // once they're over, the renewal's count holds, and the three extra pause the tools
  age(3 * HOUR);
  const after = (await owner('GET', '/api/plan')).data;
  assert.deepEqual([after.seatLimit, after.seatsUsed, after.overSeats, after.unlocked], [21, 24, true, false]);
  assert.ok(after.paidUntil - Date.now() > 700 * DAY);
  assert.equal((await owner('POST', '/api/invites', { role: 'member' })).status, 402);
});

test('a plan saved before seat steps keeps its count until the next renewal', async () => {
  billingState.set('plan', { paidUntil: Date.now() + 10 * DAY, seatLimit: 40 });
  const s = (await owner('GET', '/api/plan')).data;
  assert.equal(s.seatLimit, 40);
  assert.equal(s.overSeats, false);
});
