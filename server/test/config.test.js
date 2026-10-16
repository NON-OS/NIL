import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CONFIG = new URL('../config.js', import.meta.url).href;
const TREASURY = '0x7777777777777777777777777777777777777777';
const NOX = (whole) => (BigInt(whole * 10) * 10n ** 17n).toString();

// Log lines look like "<time> WARN  [config] <message>"; only the message matters here.
const warningsIn = (stderr) => stderr.split('\n').filter((line) => line.includes(' [config] ')).map((line) => line.slice(line.indexOf('[config]')));

// Settings are read once, when the server starts, so each case starts its own process.
function load(env) {
  const script = `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(config));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { config: JSON.parse(run.stdout), warnings: warningsIn(run.stderr) };
}

test('a clean configuration starts without warnings', () => {
  assert.deepEqual(load({}).warnings, []);
});

test('empty values count as unset and get the defaults, never 0', () => {
  const names = ['PORT', 'SESSION_DAYS', 'TRASH_DAYS', 'MAX_UPLOAD_MB', 'MAX_CAPSULE_MB', 'NOX_CHAIN_ID', 'NOX_DECIMALS', 'NOX_CONFIRMATIONS', 'NOX_EXPLORER', 'PLAN_TREASURY', 'PLAN_PRICE', 'PLAN_PERIOD_DAYS', 'PLAN_GRACE_DAYS', 'PLAN_FREE_SEATS', 'PLAN_MAX_PERIODS', 'PLAN_TRIAL_DAYS', 'STEALTH_ANNOUNCE_CHECK_DAYS', 'SEMAPHORE_DEPTH',
    'NOX_TOKEN', 'NOX_STAKING', 'ZSP_CONTRACT', 'STEALTH_ANNOUNCER', 'REWARD_TOKENS', 'NOX_RPC_TIMEOUT_SECONDS', 'NOX_MISSING_TX_HOURS', 'MAX_JSON_KB', 'NOTIFICATION_DAYS', 'USED_INVITE_DAYS',
    'JOB_PURGE_SECONDS', 'JOB_PAYMENTS_SECONDS', 'JOB_VOTES_SECONDS', 'JOB_REMINDERS_SECONDS', 'JOB_OPTIMIZE_SECONDS', 'AI_TIMEOUT_SECONDS', 'AI_MAX_RETRIES', 'SHUTDOWN_TIMEOUT_SECONDS', 'DB_JOURNAL_LIMIT_MB',
    'SETUP_TOKEN', 'LOG_FORMAT', 'STRICT_CONFIG'];
  const { config, warnings } = load(Object.fromEntries(names.map((n) => [n, ''])));
  assert.deepEqual(warnings, []);
  assert.deepEqual([config.nox.token, config.power.staking, config.power.zsp, config.stealth.announcer], ['0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca', '0xa94d6009790ba13597a1e1b7cf4e1531ea513613', '0x7b575dd8e8b111c52ab1e872924d4efd4df403df', '0x55649e01b5df198d18d95b5cc5051630cfd45564']);
  assert.deepEqual(config.rewards.map((t) => t.symbol), ['NOX', 'USDC']);
  assert.deepEqual([config.nox.rpcTimeoutMs, config.nox.missingTxMs, config.maxJsonBytes, config.readNotificationDays, config.usedInviteDays], [10_000, 24 * 3_600_000, 1024 * 1024, 90, 30]);
  assert.deepEqual(config.jobs, { purgeMs: 3_600_000, paymentsMs: 60_000, votesMs: 60_000, remindersMs: 60_000, optimizeMs: 3_600_000 });
  assert.deepEqual([config.ai.timeoutMs, config.ai.maxRetries, config.shutdownTimeoutMs, config.dbJournalLimitBytes, config.setupToken], [120_000, 1, 20_000, 64 * 1024 * 1024, null]);
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

// keccak-based EIP-55 spellings of real mainnet contracts, and the same with one letter's case flipped
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_TYPO = '0xA0b86991c6218b36c1d19d4a2e9Eb0cE3606eB48';
const NOX_CHECKSUMMED = '0x0a26c80Be4E060e688d7C23aDdB92cBb5D2C9eCA';
const NOX_TYPO = '0x0a26c80Be4E060e688d7C23aDdB92cBb5D2C9eCa';

test('contract addresses must be valid, with a correct checksum when they mix upper and lower case', () => {
  const good = load({ NOX_TOKEN: NOX_CHECKSUMMED, REWARD_TOKENS: `USDC:${USDC}:6,DAI:0x6b175474e89094c44da98b954eedeac495271d0f:18`, NOX_STAKING: 'off' });
  assert.deepEqual(good.warnings, []);
  assert.equal(good.config.nox.token, NOX_CHECKSUMMED.toLowerCase());
  assert.deepEqual(good.config.rewards.map((t) => t.symbol), ['NOX', 'USDC', 'DAI']);
  assert.equal(good.config.power.staking, null);

  const bad = load({ NOX_TOKEN: NOX_TYPO, REWARD_TOKENS: `USDC:${USDC_TYPO}:6,WETH:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2:18,JUNK`, STEALTH_ANNOUNCER: '0x1234', ZSP_CONTRACT: 'nope' });
  assert.equal(bad.config.nox.token, NOX_CHECKSUMMED.toLowerCase());
  assert.deepEqual(bad.config.rewards.map((t) => t.symbol), ['NOX', 'WETH']);
  assert.equal(bad.config.stealth.announcer, '0x55649e01b5df198d18d95b5cc5051630cfd45564');
  assert.equal(bad.config.power.zsp, '0x7b575dd8e8b111c52ab1e872924d4efd4df403df');
  assert.equal(bad.warnings.length, 5);
  for (const pattern of [/NOX_TOKEN .*checksum/, /REWARD_TOKENS entry 1 /, /REWARD_TOKENS entry 3 /, /STEALTH_ANNOUNCER/, /ZSP_CONTRACT/]) assert.ok(bad.warnings.some((w) => pattern.test(w)), pattern);
  // the values themselves stay out of the logs, in case one was a private key
  assert.ok(!bad.warnings.join('\n').includes(NOX_TYPO) && !bad.warnings.join('\n').includes('JUNK'));

  assert.deepEqual(load({ REWARD_TOKENS: 'none' }).config.rewards.map((t) => t.symbol), ['NOX']);
});

test('on a chain other than mainnet every contract has to be named', () => {
  const bare = load({ NOX_CHAIN_ID: '11155111' });
  assert.equal(bare.config.nox.enabled, false);
  assert.deepEqual([bare.config.power.staking, bare.config.power.zsp], [null, null]);
  assert.deepEqual(bare.config.rewards.map((t) => t.symbol), ['NOX']);
  assert.equal(bare.warnings.length, 3);
  for (const name of ['NOX_TOKEN', 'NOX_STAKING', 'ZSP_CONTRACT']) assert.ok(bare.warnings.some((w) => w.includes(`${name} isn’t set`)), name);

  const tokenOnly = load({ NOX_CHAIN_ID: '11155111', NOX_TOKEN: '0x1111111111111111111111111111111111111111', NOX_STAKING: 'off', ZSP_CONTRACT: 'off' });
  assert.equal(tokenOnly.config.nox.enabled, true);
  assert.equal(tokenOnly.warnings.length, 1);
  assert.match(tokenOnly.warnings[0], /REWARD_TOKENS isn’t set/);

  const named = load({ NOX_CHAIN_ID: '11155111', NOX_TOKEN: '0x1111111111111111111111111111111111111111', NOX_STAKING: 'off', ZSP_CONTRACT: '0x2222222222222222222222222222222222222222', REWARD_TOKENS: 'none' });
  assert.deepEqual(named.warnings, []);
  assert.equal(named.config.power.zsp, '0x2222222222222222222222222222222222222222');
  // the announcer is the same singleton on every chain, so it keeps its default
  assert.equal(named.config.stealth.announcer, '0x55649e01b5df198d18d95b5cc5051630cfd45564');

  // with on-chain features off, nothing is missing
  assert.deepEqual(load({ NOX_CHAIN_ID: '11155111', NOX_RPC_URL: 'off' }).warnings, []);
});

test('a payment needs at least one confirmation', () => {
  const { config, warnings } = load({ NOX_CONFIRMATIONS: '0' });
  assert.equal(config.nox.confirmations, 3);
  assert.match(warnings[0], /NOX_CONFIRMATIONS=0 .*at least 1/);
});

test('production warns about settings that leak or misdirect', () => {
  const bare = load({ NODE_ENV: 'production' });
  assert.equal(bare.warnings.length, 2);
  assert.ok(bare.warnings.some((w) => w.includes('APP_URL is empty')));
  assert.ok(bare.warnings.some((w) => w.includes('NOX_RPC_URL is the default public node')));

  const noProxy = load({ NODE_ENV: 'production', APP_URL: 'https://nil.example.com', NOX_RPC_URL: 'http://10.0.0.5:8545' });
  assert.equal(noProxy.warnings.length, 1);
  assert.match(noProxy.warnings[0], /TRUST_PROXY/);

  assert.deepEqual(load({ NODE_ENV: 'production', APP_URL: 'https://nil.example.com', TRUST_PROXY: '1', NOX_RPC_URL: 'off' }).warnings, []);
  // the same settings in development stay quiet
  assert.deepEqual(load({ APP_URL: 'https://nil.example.com' }).warnings, []);
});

test('a setup token has to be long enough to resist guessing', () => {
  assert.equal(load({ SETUP_TOKEN: 'correct-horse-battery-staple' }).config.setupToken, 'correct-horse-battery-staple');
  const short = load({ SETUP_TOKEN: 'letmein' });
  assert.equal(short.config.setupToken, null);
  assert.match(short.warnings[0], /SETUP_TOKEN must be 16/);
  assert.ok(!short.warnings[0].includes('letmein'));
});

test('STRICT_CONFIG refuses to start on any warning', () => {
  const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG)});`], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const strict = run({ STRICT_CONFIG: '1', SESSION_DAYS: 'thirty', NOX_CONFIRMATIONS: '0' });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /STRICT_CONFIG is on, so the server won’t start until the 2 warnings above are fixed/);
  assert.equal(run({ STRICT_CONFIG: '1' }).status, 0);
  assert.equal(run({ SESSION_DAYS: 'thirty' }).status, 0);
});

test('LOG_FORMAT=json writes one JSON object per line', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG)});`], { env: { PATH: process.env.PATH, LOG_FORMAT: 'json', SESSION_DAYS: 'thirty' }, encoding: 'utf8' });
  const lines = run.stderr.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].level, lines[0].scope], ['warn', 'config']);
  assert.match(lines[0].message, /SESSION_DAYS=thirty/);
  assert.ok(!Number.isNaN(Date.parse(lines[0].time)));
});
