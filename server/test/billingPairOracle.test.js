import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

const NOX = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const FEED = '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
const PAIR = '0x07ce5889d2eb681af3bd61db24ab2602c502bd1b';
const E18 = 10n ** 18n;
// a million NOX against 20 WETH is 0.00002 WETH per NOX: $0.05 at $2,500 per ETH
const CALM = { reserve0: 1_000_000n * E18, reserve1: 20n * E18 };
// a hundred times that, as if someone bought up the thin side of the pool
const PUSHED = { reserve0: 100_000n * E18, reserve1: 200n * E18 };
// the mock mines a block every 12 seconds; the window is 5 minutes
const WINDOW_BLOCKS = 25;

let srv;
let recordPoolPrice;
const chain = mockChain();
const owner = client(() => srv.base);
const nox = async () => (await owner('GET', '/api/plan/quote')).data.tokens.find((t) => t.symbol === 'NOX');
const usd = (rate) => Number(BigInt(rate) / 10n ** 12n) / 1e6;

before(async () => {
  chain.setPair(PAIR, { token0: NOX, token1: WETH, ...CALM });
  chain.setFeed(FEED, { answer: 2500n * 10n ** 8n, decimals: 8 });
  srv = await startServer({
    chain,
    env: { PLAN_TREASURY: '0x7777777777777777777777777777777777777777', PLAN_PRICE_USD: '10', PLAN_TRIAL_DAYS: '0', PLAN_NOX_POOL: PAIR, PLAN_TWAP_MINUTES: '5', PLAN_NOX_USD_MIN: '0.001', PLAN_NOX_USD_MAX: '1', PLAN_NOX_USD: '0.02' },
  });
  ({ default: recordPoolPrice } = await import('../jobs/recordPoolPrice.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

test('a Uniswap V2 pair younger than the window is priced only once Nil has recorded it for a whole window', async () => {
  assert.equal((await nox()).rateSource, 'manual', 'nothing recorded yet, and no history to read back');
  await recordPoolPrice();
  chain.mine(WINDOW_BLOCKS - 2);
  assert.equal((await nox()).rateSource, 'manual', 'recorded, but not a whole window ago');
  chain.mine(2);
  const priced = await nox();
  assert.equal(priced.rateSource, 'oracle');
  assert.ok(Math.abs(usd(priced.rate) - 0.05) < 0.0001, String(usd(priced.rate)));
});

test('one trade can’t move the price; holding a pushed price for the whole window ends up outside the bounds', async () => {
  chain.tradePair(PAIR, PUSHED);
  const right = await nox();
  assert.equal(right.rateSource, 'oracle');
  assert.ok(Math.abs(usd(right.rate) - 0.05) < 0.002, `a trade in the last block barely counts: ${usd(right.rate)}`);

  // kept there for a whole window, the average follows: $5 is far above PLAN_NOX_USD_MAX
  for (let i = 0; i < 3; i++) {
    await recordPoolPrice();
    chain.mine(WINDOW_BLOCKS);
  }
  const pushed = await nox();
  assert.equal(pushed.rateSource, 'manual');
  assert.equal(BigInt(pushed.rate), 2n * 10n ** 16n);
});

test('after a recording gap, the pair’s own history fills the window, unless the node won’t serve old state', async () => {
  chain.tradePair(PAIR, CALM);
  chain.mine(3 * WINDOW_BLOCKS);
  // the way public nodes answer a read at an old block without an archive plan
  const lift = chain.refuse((method, params) => method === 'eth_call' && /^0x[0-9a-f]+$/.test(params[1]) && Number(params[1]) < chain.head());
  try {
    assert.equal((await nox()).rateSource, 'manual', 'the last recording is too old and the node refuses old state');
  } finally {
    lift();
  }
  // tried again once the head has moved on
  chain.mine(5);
  const back = await nox();
  assert.equal(back.rateSource, 'oracle');
  assert.ok(Math.abs(usd(back.rate) - 0.05) < 0.0001, String(usd(back.rate)));
});

test('a pair Nil never recorded is priced at once from the chain’s history, with the same arithmetic', async () => {
  const { default: pairTwap } = await import('../billing/pairTwap.js');
  const { default: poolObservations } = await import('../billing/poolObservations.js');
  const FRESH = '0x3333333333333333333333333333333333333333';
  const [a, b] = [{ reserve0: 1_000_000n * E18, reserve1: 20n * E18 }, { reserve0: 1_000_000n * E18, reserve1: 30n * E18 }];
  const q = ({ reserve0, reserve1 }) => (reserve1 << 112n) / reserve0;
  chain.setPair(FRESH, { token0: NOX, token1: WETH, ...a });

  // no trade for longer than the window: the seed's last update predates it, so the pair's
  // cumulative price is carried forward at its reserves, as Uniswap's oracle library does
  chain.mine(3 * WINDOW_BLOCKS);
  const flat = await pairTwap(FRESH, 300, 1);
  const span = BigInt(flat.den >> 112n);
  assert.ok(span >= 300n && span < 340n, `a window of ${span} s`);
  assert.equal(flat.num, q(a) * span, 'exactly the price held for the whole window');
  const seeded = poolObservations.before(FRESH, chain.blockTime(chain.head()), 300);
  assert.ok(seeded, 'the reading read from history is kept');

  // a trade halfway through a fresh window: the average weighs both prices by their seconds
  const FRESH2 = '0x4444444444444444444444444444444444444444';
  chain.setPair(FRESH2, { token0: NOX, token1: WETH, ...a });
  chain.mine(3 * WINDOW_BLOCKS);
  chain.tradePair(FRESH2, b);
  const traded = chain.blockTime(chain.head());
  chain.mine(12);
  const mixed = await pairTwap(FRESH2, 300, 1);
  const end = BigInt(chain.blockTime(chain.head()));
  const start = end - (mixed.den >> 112n);
  assert.equal(mixed.num, q(a) * (BigInt(traded) - start) + q(b) * (end - BigInt(traded)));

  // once Nil's own minute readings cover the window, they take over from the seed
  const { default: pairState } = await import('../chain/pairState.js');
  const local = await pairState(FRESH2, chain.head());
  poolObservations.add(FRESH2, local, 3600);
  chain.mine(WINDOW_BLOCKS);
  assert.equal(poolObservations.before(FRESH2, chain.blockTime(chain.head()), 300).time, local.time);
});

test('the average is exact integer arithmetic, with the pair’s tokens either way round', async () => {
  const { default: pairTwap } = await import('../billing/pairTwap.js');
  const { default: pairState } = await import('../chain/pairState.js');
  const { default: poolObservations } = await import('../billing/poolObservations.js');
  const calm = await pairTwap(PAIR, 300, 1);
  // 0.00002 WETH per NOX, in billionths, give or take the last unit of the 112-bit fraction
  const perNox = (calm.num * 10n ** 9n) / calm.den;
  assert.ok(perNox === 20_000n || perNox === 19_999n, String(perNox));

  const REVERSED = '0x2222222222222222222222222222222222222222';
  chain.setPair(REVERSED, { token0: WETH, token1: NOX, reserve0: 20n * E18, reserve1: 1_000_000n * E18 });
  poolObservations.add(REVERSED, await pairState(REVERSED, chain.head()), 3600);
  chain.mine(WINDOW_BLOCKS);
  const reversed = await pairTwap(REVERSED, 300, 1);
  assert.equal(reversed.token0, WETH);
  assert.equal(reversed.num / reversed.den, 50_000n, 'NOX per WETH');
});

test('a price pushed up for a block and traded straight back leaves the rate where it was', async () => {
  chain.tradePair(PAIR, CALM);
  for (let i = 0; i < 2 * WINDOW_BLOCKS; i += 5) {
    await recordPoolPrice();
    chain.mine(5);
  }
  const calm = await nox();
  assert.equal(calm.rateSource, 'oracle');

  // a hundred times the price at the end of one block, back at the start of the next: a plain
  // average over five minutes would rise about five times over
  chain.tradePair(PAIR, PUSHED);
  chain.mine(1);
  chain.tradePair(PAIR, CALM);
  chain.mine(1);
  const after = await nox();
  assert.equal(after.rateSource, 'oracle');
  assert.ok(Math.abs(usd(after.rate) / usd(calm.rate) - 1) < 0.01, `from ${usd(calm.rate)} to ${usd(after.rate)}`);
});
