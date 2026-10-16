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

test('a Uniswap V2 pair is priced only once Nil has recorded it for a whole window', async () => {
  assert.equal((await nox()).rateSource, 'manual', 'nothing recorded yet');
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

test('after a recording gap longer than two windows, the price waits for a fresh window', async () => {
  chain.tradePair(PAIR, CALM);
  chain.mine(3 * WINDOW_BLOCKS);
  assert.equal((await nox()).rateSource, 'manual', 'the last recording is too old to average from');
  await recordPoolPrice();
  chain.mine(WINDOW_BLOCKS);
  const back = await nox();
  assert.equal(back.rateSource, 'oracle');
  assert.ok(Math.abs(usd(back.rate) - 0.05) < 0.0001, String(usd(back.rate)));
});

test('the average is exact integer arithmetic, with the pair’s tokens either way round', async () => {
  const { default: pairTwap } = await import('../billing/pairTwap.js');
  const { default: pairState } = await import('../chain/pairState.js');
  const { default: poolObservations } = await import('../billing/poolObservations.js');
  const calm = await pairTwap(PAIR, 300);
  // 0.00002 WETH per NOX, in billionths, give or take the last unit of the 112-bit fraction
  const perNox = (calm.num * 10n ** 9n) / calm.den;
  assert.ok(perNox === 20_000n || perNox === 19_999n, String(perNox));

  const REVERSED = '0x2222222222222222222222222222222222222222';
  chain.setPair(REVERSED, { token0: WETH, token1: NOX, reserve0: 20n * E18, reserve1: 1_000_000n * E18 });
  poolObservations.add(REVERSED, await pairState(REVERSED, chain.head()), 3600);
  chain.mine(WINDOW_BLOCKS);
  const reversed = await pairTwap(REVERSED, 300);
  assert.equal(reversed.token0, WETH);
  assert.equal(reversed.num / reversed.den, 50_000n, 'NOX per WETH');
});
