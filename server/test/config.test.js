import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CONFIG = new URL('../config.js', import.meta.url).href;
const TREASURY = '0x7777777777777777777777777777777777777777';
const NOX = (whole) => (BigInt(whole * 10) * 10n ** 17n).toString();

// the two settings a server can't start without; cases that aren't about them use these
const REQUIRED = { APP_URL: 'http://localhost:3000', NOX_RPC_URL: 'http://127.0.0.1:8545' };

// Settings are read once, when the server starts, so each case starts its own process.
function start(env) {
  const script = `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(config));`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
}

function load(env, { required = REQUIRED } = {}) {
  const run = start({ ...required, ...env });
  assert.equal(run.status, 0, run.stderr);
  return { config: JSON.parse(run.stdout), warnings: run.stderr.split('\n').filter((line) => line.startsWith('[config]')) };
}

function refused(env) {
  const run = start(env);
  assert.equal(run.status, 1, `expected the server to refuse ${JSON.stringify(env)}`);
  return run.stderr;
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

test('APP_URL is required, and plain http is only for this machine and onion addresses', () => {
  assert.match(refused({ NOX_RPC_URL: 'off' }), /APP_URL is required/);
  assert.match(refused({ APP_URL: 'http://nil.example.com', NOX_RPC_URL: 'off' }), /must start with https/);
  assert.match(refused({ APP_URL: 'https://nil.example.com/app', NOX_RPC_URL: 'off' }), /no path/);
  assert.match(refused({ APP_URL: 'not a url', NOX_RPC_URL: 'off' }), /isn’t a web address/);
  for (const url of ['https://nil.example.com', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://abcdefghijklmnop.onion']) {
    const { config } = load({ APP_URL: `${url}/`, NOX_RPC_URL: 'off' });
    assert.equal(config.appUrl, url);
    assert.ok(config.allowedOrigins.includes(url));
  }
});

test('a server reached over the network must name its own Ethereum node', () => {
  const stderr = refused({ APP_URL: 'https://nil.example.com' });
  assert.match(stderr, /NOX_RPC_URL is required/);
  assert.match(stderr, /own node/);
  assert.equal(load({ NOX_RPC_URL: 'off' }, { required: { APP_URL: 'http://abcdefghijklmnop.onion' } }).config.nox.enabled, false);
  // a local trial may use the public node, and is told so
  const local = load({}, { required: { APP_URL: 'http://localhost:3000' } });
  assert.equal(local.config.nox.rpcUrl, 'https://ethereum-rpc.publicnode.com');
  assert.match(local.warnings.join('\n'), /public node/);
});

test('TRUST_PROXY takes hops or proxy addresses, never everyone', () => {
  assert.equal(load({ TRUST_PROXY: '1' }).config.trustProxy, 1);
  assert.deepEqual(load({ TRUST_PROXY: 'loopback, 172.18.0.0/16,10.0.0.2' }).config.trustProxy, ['loopback', '172.18.0.0/16', '10.0.0.2']);
  for (const value of ['true', '*', 'everyone', '10.0.0.0/99']) {
    const { config, warnings } = load({ TRUST_PROXY: value });
    assert.equal(config.trustProxy, false, value);
    assert.match(warnings.join('\n'), /TRUST_PROXY/);
  }
});
