import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CONFIG = new URL('../config.js', import.meta.url).href;
const TREASURY = '0x7777777777777777777777777777777777777777';
const NOX = (whole) => (BigInt(whole * 10) * 10n ** 17n).toString();

// Settings are read once, when the server starts, so each case starts its own process.
function load(env) {
  const script = `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(config));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { config: JSON.parse(run.stdout), warnings: run.stderr.split('\n').filter((line) => line.startsWith('[config]')) };
}

test('a clean configuration starts without warnings', () => {
  assert.deepEqual(load({}).warnings, []);
});

test('empty values count as unset and get the defaults, never 0', () => {
  const names = ['PORT', 'SESSION_DAYS', 'TRASH_DAYS', 'MAX_UPLOAD_MB', 'MAX_CAPSULE_MB', 'NOX_CHAIN_ID', 'NOX_DECIMALS', 'NOX_CONFIRMATIONS', 'NOX_EXPLORER', 'PLAN_TREASURY', 'PLAN_PRICE', 'PLAN_PERIOD_DAYS', 'PLAN_GRACE_DAYS', 'PLAN_FREE_SEATS', 'PLAN_MAX_PERIODS', 'PLAN_TRIAL_DAYS', 'STEALTH_ANNOUNCE_CHECK_DAYS', 'SEMAPHORE_DEPTH'];
  const { config, warnings } = load(Object.fromEntries(names.map((n) => [n, ''])));
  assert.deepEqual(warnings, []);
  assert.deepEqual([config.port, config.sessionDays, config.trashDays, config.maxUploadBytes, config.maxCapsuleBytes], [3000, 30, 30, 25 * 1024 * 1024, 4096 * 1024 * 1024]);
  assert.deepEqual([config.nox.chainId, config.nox.decimals, config.nox.confirmations, config.nox.explorer], [1, 18, 3, 'https://etherscan.io']);
  assert.deepEqual(config.plan, { treasury: null, price: NOX(1000), periodDays: 30, graceDays: 7, freeSeats: 5, maxPeriods: 24, trialDays: 14 });
  assert.deepEqual([config.stealth.announceCheckDays, config.semaphore.depth], [7, 16]);
  // a real 0 still means 0
  assert.equal(load({ PLAN_TRIAL_DAYS: '0' }).config.plan.trialDays, 0);
});

test('a treasury or price that is set but can’t be used is reported at startup', () => {
  const badTreasury = load({ PLAN_TREASURY: '0x1234', PLAN_PRICE: '500' });
  assert.equal(badTreasury.config.plan.treasury, null);
  assert.equal(badTreasury.warnings.length, 1);
  assert.match(badTreasury.warnings[0], /PLAN_TREASURY .*community mode/);
  // the value itself stays out of the logs, in case it was a private key
  assert.ok(!badTreasury.warnings[0].includes('0x1234'));

  for (const price of ['lots', '0', '-5', '1,000']) {
    const { config, warnings } = load({ PLAN_TREASURY: TREASURY, PLAN_PRICE: price });
    assert.deepEqual([config.plan.treasury, config.plan.price], [TREASURY, NOX(1000)]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /PLAN_PRICE=.* the default, 1000/);
  }

  const fractional = load({ PLAN_TREASURY: TREASURY, PLAN_PRICE: '12.5' });
  assert.deepEqual([fractional.config.plan.price, fractional.warnings], [NOX(12.5), []]);

  const offChain = load({ PLAN_TREASURY: TREASURY, NOX_RPC_URL: 'off' });
  assert.match(offChain.warnings.join('\n'), /PLAN_TREASURY is set, but NOX_RPC_URL is off/);
});

test('numbers and explorer links that make no sense get the defaults, with a warning each', () => {
  const { config, warnings } = load({ SESSION_DAYS: 'thirty', PORT: '99999', SEMAPHORE_DEPTH: '64', MAX_UPLOAD_MB: '-5', PLAN_PERIOD_DAYS: '0', NOX_EXPLORER: 'javascript:alert(1)' });
  assert.deepEqual([config.sessionDays, config.port, config.semaphore.depth, config.maxUploadBytes, config.plan.periodDays, config.nox.explorer], [30, 3000, 16, 25 * 1024 * 1024, 30, 'https://etherscan.io']);
  assert.equal(warnings.length, 6);
  for (const name of ['SESSION_DAYS', 'PORT', 'SEMAPHORE_DEPTH', 'MAX_UPLOAD_MB', 'PLAN_PERIOD_DAYS', 'NOX_EXPLORER']) {
    assert.ok(warnings.some((w) => w.includes(name)), name);
  }
});
