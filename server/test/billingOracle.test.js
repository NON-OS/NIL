import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const FEED = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
const POOL = '0x1111111111111111111111111111111111111111';
const E18 = 10n ** 18n;
// 1.0001^-108204 WETH per NOX at $2,500 per ETH is about $0.05 per NOX
const TICK = -108204;

let srv;
const chain = mockChain();
const owner = client(() => srv.base);
const quote = async (query = '') => (await owner('GET', `/api/plan/quote${query}`)).data;
const noxOf = (q) => q.tokens.find((t) => t.symbol === 'NOX');
const usd = (rate) => Number(BigInt(rate) / 10n ** 12n) / 1e6;

before(async () => {
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK });
  chain.setFeed(FEED, { answer: 2500n * 10n ** 8n, decimals: 8 });
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: '0x7777777777777777777777777777777777777777', PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_POOL: POOL, PLAN_NOX_USD_MIN: '0.001', PLAN_NOX_USD_MAX: '1', PLAN_NOX_USD: '0.02', PLAN_NOX_DISCOUNT: '25' },
  });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('NOX is priced from the pool’s time-weighted average times Chainlink’s ETH/USD', async () => {
  const nox = noxOf(await quote());
  assert.equal(nox.rateSource, 'oracle');
  assert.ok(Math.abs(usd(nox.rate) - 0.05) < 0.0001, String(usd(nox.rate)));
  // $10 less the 25% NOX discount is $7.50, about 150 NOX at $0.05
  assert.equal(nox.usd, 7_500_000);
  const units = Number(BigInt(nox.minimum) / 10n ** 14n) / 10_000;
  assert.ok(Math.abs(units - 150) < 0.1, String(units));
});

test('the same price comes out when NOX is the pool’s second token', async () => {
  chain.setPool(POOL, { token0: WETH, token1: NOX, tick: -TICK });
  try {
    assert.ok(Math.abs(usd(noxOf(await quote()).rate) - 0.05) < 0.0001);
  } finally {
    chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK });
  }
});

test('a stale feed, a price outside the bounds, a reverting pool or the wrong pair falls back to the manual rate', async () => {
  const fallback = async (why) => {
    const nox = noxOf(await quote());
    assert.equal(nox.rateSource, 'manual', why);
    assert.equal(BigInt(nox.rate), 2n * 10n ** 16n, why);
  };
  chain.setFeed(FEED, { answer: 2500n * 10n ** 8n, updatedAt: Math.floor(Date.now() / 1000) - 3 * 3600 });
  await fallback('stale feed');
  chain.setFeed(FEED, { answer: 0n });
  await fallback('zero answer');
  chain.setFeed(FEED, { answer: 2500n * 10n ** 8n });

  // about $5 per NOX: far above PLAN_NOX_USD_MAX, as if someone pushed the pool
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK + 46052 });
  await fallback('above the bounds');
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK - 46052 });
  await fallback('below the bounds');
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK, fail: true });
  await fallback('pool reverts');
  chain.setPool(POOL, { token0: NOX, token1: '0x2222222222222222222222222222222222222222', tick: TICK });
  await fallback('not a NOX/WETH pool');
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK });
  assert.equal(noxOf(await quote()).rateSource, 'oracle');
});

test('an invoice keeps the rate it was made with, whatever the market does next', async () => {
  const invoice = (await owner('POST', '/api/plan/invoices', {})).data.invoice;
  const nox = invoice.amounts.find((a) => a.symbol === 'NOX');
  assert.equal(nox.rateSource, 'oracle');
  // NOX doubles
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK + 6932 });
  const later = (await owner('GET', `/api/plan/invoices/${invoice.id}`)).data.invoice.amounts.find((a) => a.symbol === 'NOX');
  assert.deepEqual([later.amount, later.rate], [nox.amount, nox.rate]);
  assert.ok(Math.abs(usd(noxOf(await quote()).rate) - 0.1) < 0.001);
  chain.setPool(POOL, { token0: NOX, token1: WETH, tick: TICK });
});

test('prices, discounts and rounding are exact integer arithmetic', async () => {
  const { default: priceBreakdown } = await import('../billing/priceBreakdown.js');
  const { default: usdToUnits } = await import('../billing/usdToUnits.js');
  const { default: askAmount } = await import('../billing/askAmount.js');
  const { default: sameSuffix } = await import('../billing/sameSuffix.js');
  const { default: amountGrid } = await import('../billing/amountGrid.js');
  const base = { periods: 3, freeSeats: 5, priceUsd: 12_000_000, seatUsd: 3_000_000, periodMs: 30 };
  assert.deepEqual(
    (({ seats, baseUsd, seatsUsd, stakerUsd, totalUsd, creditUsd, dueUsd }) => ({ seats, baseUsd, seatsUsd, stakerUsd, totalUsd, creditUsd, dueUsd }))(priceBreakdown({ ...base, people: 8, stakerPercent: 10, credit: 1_000_000 })),
    { seats: 3, baseUsd: 36_000_000, seatsUsd: 27_000_000, stakerUsd: 6_300_000, totalUsd: 56_700_000, creditUsd: 1_000_000, dueUsd: 55_700_000 },
  );
  // fewer people than free seats pay only the flat fee; credit never goes past the total
  const small = priceBreakdown({ ...base, people: 2, credit: 99_000_000 });
  assert.deepEqual([small.seats, small.seatsUsd, small.creditUsd, small.dueUsd], [0, 0, 36_000_000, 0]);
  // adding 2 seats with a third of the period left
  const seats = priceBreakdown({ ...base, kind: 'seats', people: 9, seatLimit: 7, remainingMs: 10 });
  assert.deepEqual([seats.periods, seats.seats, seats.baseUsd, seats.seatsUsd], [0, 2, 0, 2_000_000]);

  // never less than the price: one unit up rather than short
  assert.equal(usdToUnits(1, 18, 3n * E18), 333_333_333_334n);
  assert.equal(usdToUnits(12_340_000, 6, E18), 12_340_000n);
  // rounded up to the price grid, then the suffix in the places below it
  const usdc = amountGrid(6);
  const nox = amountGrid(18);
  assert.deepEqual([usdc.low, usdc.grid, nox.low, nox.grid], [1n, 10_000n, 10n ** 10n, 10n ** 14n]);
  assert.equal(askAmount(12_345_678n, usdc.grid, 42n * usdc.low), 12_350_042n);
  assert.equal(askAmount(150n * E18 + 1n, nox.grid, 7n * nox.low), 150n * E18 + 10n ** 14n + 7n * 10n ** 10n);
  // the same suffix under any price, but not with stray digits below the places in use
  assert.equal(sameSuffix(99_990_042n, 12_350_042n, usdc.grid), true);
  assert.equal(sameSuffix(12_350_043n, 12_350_042n, usdc.grid), false);
  assert.equal(sameSuffix(150n * E18 + 7n * 10n ** 10n + 1n, 150n * E18 + 7n * 10n ** 10n, nox.grid), false);
});
