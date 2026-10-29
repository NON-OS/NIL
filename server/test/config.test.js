import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const CONFIG = new URL('../config.js', import.meta.url).href;
const TREASURY = '0x7777777777777777777777777777777777777777';

// Log lines look like "<time> WARN  [config] <message>"; only the message matters here.
const warningsIn = (stderr) => stderr.split('\n').filter((line) => line.includes(' [config] ')).map((line) => line.slice(line.indexOf('[config]')));
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
  return { config: JSON.parse(run.stdout), warnings: warningsIn(run.stderr) };
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
  const names = ['PORT', 'SESSION_DAYS', 'TRASH_DAYS', 'MAX_UPLOAD_MB', 'MAX_CAPSULE_MB', 'NOX_CHAIN_ID', 'NOX_DECIMALS', 'NOX_CONFIRMATIONS', 'NOX_EXPLORER', 'PLAN_TREASURY', 'PLAN_PRICE', 'PLAN_PERIOD_DAYS', 'PLAN_GRACE_DAYS', 'PLAN_FREE_SEATS', 'PLAN_MAX_PERIODS', 'PLAN_TRIAL_DAYS', 'PLAN_TRIAL_GRACE_DAYS', 'STEALTH_ANNOUNCE_CHECK_DAYS', 'SEMAPHORE_DEPTH',
    'NOX_TOKEN', 'NOX_STAKING', 'ZSP_CONTRACT', 'STEALTH_ANNOUNCER', 'REWARD_TOKENS', 'NOX_RPC_TIMEOUT_SECONDS', 'NOX_MISSING_TX_HOURS', 'MAX_JSON_KB', 'NOTIFICATION_DAYS', 'USED_INVITE_DAYS',
    'JOB_PURGE_SECONDS', 'JOB_PAYMENTS_SECONDS', 'JOB_VOTES_SECONDS', 'JOB_REMINDERS_SECONDS', 'JOB_AGENT_DUE_SOON_SECONDS', 'JOB_AGENT_PRUNE_SECONDS', 'JOB_DUE_ALERTS_SECONDS', 'JOB_OPTIMIZE_SECONDS', 'JOB_POOL_PRICE_SECONDS', 'JOB_TRANSFER_FEE_SECONDS', 'JOB_BILLING_WATCHDOG_SECONDS', 'PAYMENT_STALL_HOURS', 'PLAN_RECONCILE_MINUTES', 'PLAN_RECONCILE_BLOCKS', 'PLAN_RECONCILE_DAYS', 'NOX_MAX_TRANSFER_FEE_BPS', 'AI_TIMEOUT_SECONDS', 'AI_MAX_RETRIES', 'SHUTDOWN_TIMEOUT_SECONDS', 'DB_JOURNAL_LIMIT_MB',
    'SETUP_TOKEN', 'LOG_FORMAT', 'STRICT_CONFIG'];
  const { config, warnings } = load(Object.fromEntries(names.map((n) => [n, ''])));
  assert.deepEqual(warnings, []);
  assert.deepEqual([config.nox.token, config.power.staking, config.power.zsp, config.stealth.announcer], ['0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca', '0xa94d6009790ba13597a1e1b7cf4e1531ea513613', '0x7b575dd8e8b111c52ab1e872924d4efd4df403df', '0x55649e01b5df198d18d95b5cc5051630cfd45564']);
  assert.deepEqual(config.rewards.map((t) => t.symbol), ['NOX', 'USDC']);
  assert.deepEqual([config.nox.rpcTimeoutMs, config.nox.missingTxMs, config.maxJsonBytes, config.readNotificationDays, config.usedInviteDays], [10_000, 24 * 3_600_000, 1024 * 1024, 90, 30]);
  assert.deepEqual(config.jobs, { purgeMs: 3_600_000, paymentsMs: 60_000, votesMs: 60_000, remindersMs: 60_000, dueAlertsMs: 60_000, agentDueSoonMs: 300_000, agentPruneMs: 3_600_000, optimizeMs: 3_600_000, poolPriceMs: 60_000, transferFeeMs: 600_000, billingWatchdogMs: 300_000 });
  assert.deepEqual([config.payments.stallHours, config.billing.reconcileMinutes, config.billing.reconcileBlocks, config.billing.reconcileDays, config.nox.maxTransferFeeBps], [6, 60, 7200, 30, 300]);
  assert.deepEqual([config.ai.timeoutMs, config.ai.maxRetries, config.shutdownTimeoutMs, config.dbJournalLimitBytes, config.setupToken], [120_000, 1, 20_000, 64 * 1024 * 1024, null]);
  assert.deepEqual([config.port, config.sessionDays, config.trashDays, config.maxUploadBytes, config.maxCapsuleBytes], [3000, 30, 30, 25 * 1024 * 1024, 4096 * 1024 * 1024]);
  assert.deepEqual([config.nox.chainId, config.nox.decimals, config.nox.explorer], [1, 18, 'https://etherscan.io']);
  assert.deepEqual(config.plan, { treasury: null, periodDays: 30, graceDays: 7, freeSeats: 5, maxPeriods: 24, trialDays: 14, trialGraceDays: 7 });
  assert.deepEqual([config.stealth.announceCheckDays, config.semaphore.depth], [7, 16]);
  // a real 0 still means 0
  assert.equal(load({ PLAN_TRIAL_DAYS: '0' }).config.plan.trialDays, 0);
});

test('upload quotas and bounty board limits have defaults, and 0 turns a quota off', () => {
  const MB = 1024 * 1024;
  const names = ['UPLOADS_PER_HOUR', 'CONTENT_WRITES_PER_MINUTE', 'STORAGE_CHECK_SECONDS', 'UPLOAD_QUOTA_PER_MEMBER_MB', 'UPLOAD_QUOTA_PER_GUEST_MB', 'UPLOAD_QUOTA_MB', 'BOUNTY_MAX_PENDING_APPLICATIONS', 'BOUNTY_APPLICATIONS_PER_WALLET', 'BOUNTY_APPLICATIONS_PER_HOUR'];
  const { config, warnings } = load(Object.fromEntries(names.map((n) => [n, ''])));
  assert.deepEqual(warnings, []);
  assert.deepEqual(config.uploads, { perHour: 120, writesPerMinute: 120, storageCheckSeconds: 10, memberQuotaBytes: 2048 * MB, guestQuotaBytes: 100 * MB, workspaceQuotaBytes: 20480 * MB });
  assert.deepEqual(config.bountyBoard, { maxPending: 100, perWallet: 5, perHour: 20 });
  assert.equal(load({ UPLOAD_QUOTA_MB: '0' }).config.uploads.workspaceQuotaBytes, 0);
  const bad = load({ UPLOADS_PER_HOUR: '0', BOUNTY_APPLICATIONS_PER_HOUR: 'lots' });
  assert.deepEqual([bad.config.uploads.perHour, bad.config.bountyBoard.perHour, bad.warnings.length], [120, 20, 2]);
});

test('a treasury that is set but can’t be used is reported at startup', () => {
  const badTreasury = load({ PLAN_TREASURY: '0x1234' });
  assert.equal(badTreasury.config.plan.treasury, null);
  assert.equal(badTreasury.warnings.length, 1);
  assert.match(badTreasury.warnings[0], /PLAN_TREASURY .*community mode/);
  // the value itself stays out of the logs, in case it was a private key
  assert.ok(!badTreasury.warnings[0].includes('0x1234'));

  // the old NOX price is no longer read, and saying so beats silently charging something else
  const { warnings } = load({ PLAN_TREASURY: TREASURY, PLAN_PRICE: '12.5' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /PLAN_PRICE is no longer read.*PLAN_PRICE_USD/);

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

test('the stealth registry is the ERC-6538 singleton on every chain unless turned off', () => {
  const REGISTRY = '0x6538e6bf4b0ebd30a8ea093027ac2422ce5d6538';
  const plain = load({ STEALTH_REGISTRY: '', STEALTH_REGISTRY_CACHE_SECONDS: '' });
  assert.deepEqual(plain.warnings, []);
  assert.deepEqual([plain.config.stealth.registry, plain.config.stealth.registryCacheMs], [REGISTRY, 300_000]);
  assert.equal(load({ STEALTH_REGISTRY: '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538' }).config.stealth.registry, REGISTRY);
  assert.equal(load({ STEALTH_REGISTRY: 'off' }).config.stealth.registry, null);
  const typo = load({ STEALTH_REGISTRY: '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538'.replace('E6', 'e6'), STEALTH_REGISTRY_CACHE_SECONDS: '0' });
  assert.equal(typo.config.stealth.registry, REGISTRY);
  assert.equal(typo.warnings.length, 2);
  assert.match(typo.warnings[0], /STEALTH_REGISTRY isn’t a valid Ethereum address .*Using the default/);
  assert.equal(typo.config.stealth.registryCacheMs, 300_000);
  const sepolia = load({ NOX_CHAIN_ID: '11155111', NOX_TOKEN: '0x1111111111111111111111111111111111111111', NOX_STAKING: 'off', ZSP_CONTRACT: 'off', REWARD_TOKENS: 'none' });
  assert.equal(sepolia.config.stealth.registry, REGISTRY);
});

test('settings that no longer do anything say so', () => {
  const { warnings } = load({ NOX_CONFIRMATIONS: '0' });
  assert.match(warnings[0], /NOX_CONFIRMATIONS is no longer read/);
});

test('production warns about settings that leak or misdirect', () => {
  const named = load({ NODE_ENV: 'production', APP_URL: 'https://nil.example.com', TRUST_PROXY: '1', NOX_RPC_URL: 'https://ethereum-rpc.publicnode.com' });
  assert.equal(named.warnings.length, 1);
  assert.match(named.warnings[0], /NOX_RPC_URL is the default public node/);

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
  const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG)});`], { env: { PATH: process.env.PATH, ...REQUIRED, ...env }, encoding: 'utf8' });
  const strict = run({ STRICT_CONFIG: '1', SESSION_DAYS: 'thirty', NOX_CONFIRMATIONS: '0' });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /STRICT_CONFIG is on, so the server won’t start until the 2 warnings above are fixed/);
  assert.equal(run({ STRICT_CONFIG: '1' }).status, 0);
  assert.equal(run({ SESSION_DAYS: 'thirty' }).status, 0);
});

test('LOG_FORMAT=json writes one JSON object per line', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG)});`], { env: { PATH: process.env.PATH, ...REQUIRED, LOG_FORMAT: 'json', SESSION_DAYS: 'thirty' }, encoding: 'utf8' });
  const lines = run.stderr.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].level, lines[0].scope], ['warn', 'config']);
  assert.match(lines[0].message, /SESSION_DAYS=thirty/);
  assert.ok(!Number.isNaN(Date.parse(lines[0].time)));
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

test('billing settings default sensibly and say so when a value can’t be used', () => {
  const { config, warnings } = load({});
  assert.deepEqual(warnings, []);
  const b = config.billing;
  assert.deepEqual([b.priceUsd, b.seatUsd, b.noxDiscount, b.suffixDigits, b.amountDecimals, b.invoiceHours, b.burnShare, b.slot, b.treasuryName], [4_000_000, 1_000_000, 50, 4, 8, 24, 0, null, 'the treasury']);
  assert.deepEqual(b.stakerTiers, [{ stake: '10000', percent: 10 }, { stake: '100000', percent: 25 }]);
  assert.deepEqual(b.remindDays, [7, 1]);
  assert.equal(b.usdc.address, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  assert.equal(b.oracle.manualUsd, null);
  assert.equal(config.finality.depth, 64);
  assert.deepEqual([config.holders.zspWorth, config.holders.graceDays], ['100000', 3]);

  const bad = load({
    PLAN_PRICE_USD: '0',
    PLAN_SEAT_USD: 'free',
    PLAN_STAKER_TIERS: '10000:150',
    PLAN_INVOICE_SLOT: '12/10',
    BURN_SHARE: '120',
    PLAN_NOX_USD: '-1',
    PLAN_NOX_POOL: '0xnope',
    PRO_FOR_ZSP: 'maybe',
    BURN_REPORT_URL: 'javascript:alert(1)',
  });
  assert.deepEqual([bad.config.billing.priceUsd, bad.config.billing.seatUsd, bad.config.billing.stakerTiers, bad.config.billing.slot, bad.config.billing.burnShare, bad.config.billing.oracle.manualUsd, bad.config.billing.oracle.pool, bad.config.billing.proForZsp, bad.config.billing.burnReportUrl], [4_000_000, 1_000_000, [], null, 0, null, null, true, null]);
  for (const name of ['PLAN_PRICE_USD', 'PLAN_SEAT_USD', 'PLAN_STAKER_TIERS', 'PLAN_INVOICE_SLOT', 'BURN_SHARE', 'PLAN_NOX_USD', 'PLAN_NOX_POOL', 'PRO_FOR_ZSP', 'BURN_REPORT_URL']) {
    assert.ok(bad.warnings.some((w) => w.includes(name)), name);
  }

  const hosted = load({ PLAN_INVOICE_SLOT: '3/50', PLAN_PRICE_USD: '19.99', PLAN_USDC: 'off' });
  assert.deepEqual(hosted.config.billing.slot, { index: 3, count: 50 });
  assert.equal(hosted.config.billing.priceUsd, 19_990_000);
  assert.equal(hosted.config.billing.usdc, null);
  // a slot without a key works, but the warning says what it gives away
  assert.match(hosted.warnings.join('\n'), /PLAN_INVOICE_SLOT is set without PLAN_INVOICE_KEY/);
});

test('no model is assumed: built-in AI needs ANTHROPIC_MODEL, agents fall back to it, prices start unset', () => {
  const none = load({});
  assert.deepEqual([none.config.ai.enabled, none.config.ai.model, none.config.agents.model, none.config.agents.priceIn, none.config.agents.priceOut], [false, null, null, null, null]);

  const keyOnly = load({ ANTHROPIC_API_KEY: 'sk-test-key' });
  assert.deepEqual([keyOnly.config.ai.enabled, keyOnly.config.ai.hasKey, keyOnly.config.agents.model], [false, true, null]);
  assert.equal(keyOnly.warnings.length, 1);
  assert.match(keyOnly.warnings[0], /ANTHROPIC_MODEL isn’t, so built-in AI stays off\. Set ANTHROPIC_MODEL.*AGENT_MODEL/);

  const shared = load({ ANTHROPIC_API_KEY: 'sk-test-key', ANTHROPIC_MODEL: 'test-model' });
  assert.deepEqual([shared.config.ai.enabled, shared.config.ai.model, shared.config.agents.model, shared.warnings], [true, 'test-model', 'test-model', []]);
  const own = load({ ANTHROPIC_AUTH_TOKEN: 'token', ANTHROPIC_MODEL: 'test-model', AGENT_MODEL: 'test-agent-model' });
  assert.equal(own.config.agents.model, 'test-agent-model');
  // a model for agents only still leaves built-in AI off, and says so without asking for AGENT_MODEL
  const agentsOnly = load({ ANTHROPIC_API_KEY: 'sk-test-key', AGENT_MODEL: 'test-model' });
  assert.equal(agentsOnly.config.ai.enabled, false);
  assert.doesNotMatch(agentsOnly.warnings.join('\n'), /AGENT_MODEL/);

  assert.equal(none.config.agents.fallbacks, null);
  assert.equal(load({ AGENT_FALLBACKS: 'default' }).config.agents.fallbacks, 'default');
  const unknown = load({ AGENT_FALLBACKS: 'always' });
  assert.equal(unknown.config.agents.fallbacks, null);
  assert.match(unknown.warnings[0], /AGENT_FALLBACKS=always isn’t "default" or "off"/);

  const priced = load({ AGENT_PRICE_INPUT_PER_MTOK: '2.5', AGENT_PRICE_OUTPUT_PER_MTOK: '10' });
  assert.deepEqual([priced.config.agents.priceIn, priced.config.agents.priceOut], [2.5, 10]);
  const typo = load({ AGENT_PRICE_INPUT_PER_MTOK: 'four' });
  assert.equal(typo.config.agents.priceIn, null);
  assert.match(typo.warnings[0], /AGENT_PRICE_INPUT_PER_MTOK=four .*Leaving it unset\./);
});
