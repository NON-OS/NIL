import net from 'node:net';
import path from 'node:path';
import envNumber from './lib/envNumber.js';
import configWarning from './lib/configWarning.js';
import validAddress from './lib/validAddress.js';
import log from './lib/log.js';
import refuseToStart from './lib/refuseToStart.js';

// Every setting is optional except APP_URL, and NOX_RPC_URL on a server reached over the network.
// An empty value counts as unset. A value that is set but can't be used gets the default, or
// turns its feature off, and says so in a warning at startup.
const env = process.env;
const production = env.NODE_ENV === 'production';
const SECOND = 1000;
const HOUR = 3_600_000;
const MB = 1024 * 1024;

// Where people reach this server. Wallet sign-in messages name this domain and only this origin
// may make changes, so it can never be read from request headers, where a phishing site would put
// its own. Plain http is accepted only on this machine and for .onion addresses, which Tor
// already authenticates. These two settings are required, so a bad value stops the server.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com';

function site(value) {
  const help = 'Set it to the address people type: https://nil.example.com, http://<your-address>.onion for Tor, or http://localhost:3000 on this machine (http://localhost:5173 with npm run dev).';
  if (!value) refuseToStart(`APP_URL is required. ${help}`);
  let url;
  try {
    url = new URL(value);
  } catch {
    refuseToStart(`APP_URL isn’t a web address. ${help}`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  const plainAllowed = local || url.hostname.endsWith('.onion');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && plainAllowed)) refuseToStart(`APP_URL must start with https://, except for localhost and .onion addresses. ${help}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) refuseToStart(`APP_URL must be the address alone, with no path. ${help}`);
  return { origin: url.origin, local };
}

// The node sees every wallet and payout address this server looks up, and from which IP, so a
// public node could link them to your team. Only a local trial may fall back to one.
function rpcUrl(value, local) {
  if (value) return value;
  if (!local) {
    refuseToStart(
      'NOX_RPC_URL is required on a server people reach over the network. The Ethereum node sees every wallet and payout address Nil looks up, and this server’s IP address, so a public node could link them to your team. ' +
        'Run your own node (an execution client such as Geth, Nethermind or Reth, with a consensus client) and set NOX_RPC_URL to it, use a provider you trust, or set NOX_RPC_URL=off to turn on-chain features off.',
    );
  }
  configWarning(`NOX_RPC_URL isn’t set, so this local server uses the public node at ${DEFAULT_RPC}, which sees every address it looks up. Set your own node, or off, before others use this server.`);
  return DEFAULT_RPC;
}

const app = site((env.APP_URL ?? '').trim());

const origins = (env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
origins.push(app.origin);

// Forwarded headers are believed only from the proxy in front: a number of hops, or the proxy's
// address or subnet. "true" would believe anyone who reaches the port, so a visitor connecting
// directly could claim any IP and slip past every rate limit.
const NAMED_PROXIES = new Set(['loopback', 'linklocal', 'uniquelocal']);
function proxyAddress(entry) {
  if (NAMED_PROXIES.has(entry) || net.isIP(entry)) return true;
  const [ip, bits, ...rest] = entry.split('/');
  const version = net.isIP(ip);
  return Boolean(version) && !rest.length && /^\d{1,3}$/.test(bits ?? '') && Number(bits) <= (version === 4 ? 32 : 128);
}

function trustProxy(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  const entries = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length && entries.every(proxyAddress)) return entries;
  configWarning(`TRUST_PROXY=${value} isn’t a number of proxy hops or a list of proxy addresses (such as loopback, uniquelocal or 172.18.0.0/16). Forwarded headers are ignored until it’s fixed.`);
  return false;
}

// Explorer links open from the app, so only an http(s) address will do. The value isn't
// repeated in the warning, in case it carries an API key.
function explorer(value) {
  const fallback = 'https://etherscan.io';
  if (!value) return fallback;
  try {
    if (['http:', 'https:'].includes(new URL(value).protocol)) return value.replace(/\/+$/, '');
  } catch {}
  configWarning(`NOX_EXPLORER isn’t an http or https address. Using the default, ${fallback}.`);
  return fallback;
}

// log.js reads LOG_FORMAT itself, since it has to work before this file has run. This only
// catches a typo.
if (!['', 'text', 'json'].includes((env.LOG_FORMAT ?? '').trim())) configWarning('LOG_FORMAT is neither "text" nor "json". Using text.');

// The one-time token that claims a fresh server. Without one, the server makes its own at first
// start and prints it once. It travels in a header, so only printable ASCII will do.
function setupToken(value) {
  if (!value) return null;
  if (/^[\x21-\x7e]{16,200}$/.test(value)) return value;
  configWarning('SETUP_TOKEN must be 16 to 200 printable characters with no spaces. It’s ignored, and the server makes its own token at first start.');
  return null;
}

// NOX lives on Ethereum. "off" disables every on-chain feature.
const rpcOff = env.NOX_RPC_URL === 'off';
const chainId = envNumber('NOX_CHAIN_ID', 1, { min: 1 });
const ADDRESS_RULE = '0x and 40 hex characters, with a correct EIP-55 checksum if it mixes upper and lower case';

// A contract address. The defaults are Ethereum mainnet contracts, so on any other chain the
// operator has to name each contract, or "off" where a source can be left out. A value that
// isn't a valid address is reported and replaced by the default on mainnet. Elsewhere there is
// no default to fall back on, so the feature it serves stays off. Addresses aren't repeated in
// warnings: a private key pasted into the wrong line must not end up in the logs.
function contract(name, mainnet, { canBeOff = false, withoutIt }) {
  const value = (env[name] ?? '').trim();
  if (canBeOff && value === 'off') return null;
  if (validAddress(value)) return value.toLowerCase();
  if (value) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). ${chainId === 1 ? `Using the default, ${mainnet}.` : withoutIt}`);
  if (chainId === 1) return mainnet.toLowerCase();
  if (!value && !rpcOff) configWarning(`${name} isn’t set, and its default is a mainnet contract, but NOX_CHAIN_ID is ${chainId}. ${withoutIt}`);
  return null;
}

const NOX_MAINNET = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';
const noxToken = contract('NOX_TOKEN', NOX_MAINNET, { withoutIt: 'On-chain features are off until it’s set.' });

const nox = Object.freeze({
  enabled: !rpcOff && noxToken !== null,
  rpcUrl: rpcUrl(env.NOX_RPC_URL, app.local),
  rpcTimeoutMs: envNumber('NOX_RPC_TIMEOUT_SECONDS', 10, { min: 1, max: 300 }) * SECOND,
  // the mainnet address stays in place when NOX is off for want of one, so nothing downstream sees null
  token: noxToken ?? NOX_MAINNET,
  chainId,
  symbol: env.NOX_SYMBOL || 'NOX',
  // token amounts fit in 256 bits, so more decimals than 77 can't mean anything
  decimals: envNumber('NOX_DECIMALS', 18, { max: 77 }),
  // how long a recorded payment may wait for its transaction to appear before it fails
  missingTxMs: envNumber('NOX_MISSING_TX_HOURS', 24, { min: 1 }) * HOUR,
  explorer: explorer(env.NOX_EXPLORER),
});

// Tokens a team can pay bounties in, as SYMBOL:address:decimals pairs. NOX always comes first.
// The default is USDC on mainnet, so another chain needs its own list, or "none".
const DEFAULT_REWARDS = 'USDC:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:6';

function rewardTokens(value) {
  const noxEntry = Object.freeze({ symbol: nox.symbol, address: nox.token, decimals: nox.decimals });
  if (value === 'none') return Object.freeze([noxEntry]);
  if (!value && chainId !== 1) {
    if (nox.enabled) configWarning(`REWARD_TOKENS isn’t set, and its default is USDC on mainnet, but NOX_CHAIN_ID is ${chainId}. Bounties are paid in ${nox.symbol} only until it lists this chain’s tokens (or says "none").`);
    return Object.freeze([noxEntry]);
  }
  const listed = (value || DEFAULT_REWARDS)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry, i) => {
      const [symbol, address, decimals, ...extra] = entry.split(':');
      const places = /^\d+$/.test(decimals ?? '') ? Number(decimals) : NaN;
      if (!symbol || extra.length || !validAddress(address) || !(places <= 77)) {
        configWarning(`REWARD_TOKENS entry ${i + 1} isn’t SYMBOL:address:decimals with a valid address (${ADDRESS_RULE}), so it’s left out.`);
        return [];
      }
      return [Object.freeze({ symbol: symbol.toUpperCase(), address: address.toLowerCase(), decimals: places })];
    });
  return Object.freeze([noxEntry, ...listed.filter((t) => t.symbol !== nox.symbol)]);
}

// A treasury that can't be used means community mode, said out loud. The value isn't repeated
// in the warning: a private key pasted here by mistake must not end up in the logs.
function planTreasury(value) {
  if (!value) return null;
  if (!validAddress(value)) {
    configWarning(`PLAN_TREASURY is set but isn’t a valid Ethereum address (${ADDRESS_RULE}). The subscription is off and every tool is unlocked (community mode) until it’s fixed.`);
    return null;
  }
  if (!nox.enabled) configWarning(`PLAN_TREASURY is set, but ${rpcOff ? 'NOX_RPC_URL is off' : 'NOX_TOKEN is missing'}, so payments can’t be checked. The subscription is off and every tool is unlocked (community mode).`);
  return value.toLowerCase();
}

const plan = Object.freeze({
  treasury: planTreasury((env.PLAN_TREASURY ?? '').trim()),
  periodDays: envNumber('PLAN_PERIOD_DAYS', 30, { min: 1 }),
  graceDays: envNumber('PLAN_GRACE_DAYS', 7),
  freeSeats: envNumber('PLAN_FREE_SEATS', 5),
  maxPeriods: envNumber('PLAN_MAX_PERIODS', 24, { min: 1 }),
  trialDays: envNumber('PLAN_TRIAL_DAYS', 14),
});

// Private payouts (ERC-5564 stealth addresses). The announcer is the standard's singleton, the
// same address on every chain it's deployed to, which is why it alone keeps its default on other
// chains. The top-up is ETH the payer sends along so the contributor can move the tokens without
// first funding the one-time address from a known wallet.
const STEALTH_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';

function announcer(value) {
  if (validAddress(value)) return value.toLowerCase();
  if (value) configWarning(`STEALTH_ANNOUNCER isn’t a valid Ethereum address (${ADDRESS_RULE}). Using the default, ${STEALTH_ANNOUNCER}.`);
  return STEALTH_ANNOUNCER.toLowerCase();
}

const stealth = Object.freeze({
  announcer: announcer((env.STEALTH_ANNOUNCER ?? '').trim()),
  gasTopUpWei: /^\d+$/.test(env.STEALTH_GAS_TOPUP_WEI ?? '') ? env.STEALTH_GAS_TOPUP_WEI : '300000000000000',
  // the least tip a move out of a one-time address offers, whatever the node suggests
  minTipWei: /^\d+$/.test(env.STEALTH_MIN_TIP_WEI ?? '') ? env.STEALTH_MIN_TIP_WEI : '50000000',
  // how long a confirmed payout keeps being checked for a late announcement
  announceCheckDays: envNumber('STEALTH_ANNOUNCE_CHECK_DAYS', 7),
  // payout balances are looked up one address at a time, at random moments within this window
  balanceSpreadMs: envNumber('STEALTH_BALANCE_SPREAD_SECONDS', 1800, { min: 1 }) * SECOND,
});

// Voting power: NOX in linked wallets, plus NOX staked in the official staking contract, plus a
// fixed amount of power per Zero-State Pass (ZSP). Admins can change the ZSP power per workspace;
// this is the default. "off" leaves a source out.
const power = Object.freeze({
  staking: contract('NOX_STAKING', '0xa94d6009790Ba13597A1E1b7cF4e1531eA513613', { canBeOff: true, withoutIt: 'Staked NOX is left out of voting power until it’s set (or set to "off").' }),
  zsp: contract('ZSP_CONTRACT', '0x7b575dd8e8b111c52ab1e872924d4efd4df403df', { canBeOff: true, withoutIt: 'Zero-State Passes are left out of voting power until it’s set (or set to "off").' }),
  zspPower: /^\d+$/.test(env.VOTE_ZSP_POWER ?? '') ? env.VOTE_ZSP_POWER : '100000',
});

// ---------------------------------------------------------------------------------------------
// Nil Pro billing, NOX perks and the fair holder door
// ---------------------------------------------------------------------------------------------
// Prices are in USD. A workspace pays an invoice in USDC at face value or in NOX at a discount;
// every amount it asks for ends in a short suffix that tells its payment apart from anyone
// else's, so a transfer from any wallet or exchange can be matched to the right invoice.

// "12" or "12.50" as micro-USD (USDC's precision). Null for anything else.
function microUsd(value) {
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

function envUsd(name, fallback, { positive = false } = {}) {
  const raw = (env[name] ?? '').trim();
  if (!raw) return microUsd(fallback);
  const value = microUsd(raw);
  if (value !== null && (!positive || value > 0)) return value;
  configWarning(`${name}=${raw} isn’t an amount of US dollars${positive ? ' above zero' : ''}, like 12 or 12.50. Using the default, ${fallback}.`);
  return microUsd(fallback);
}

// A billing contract. Like the other contracts, a mainnet default applies only on mainnet;
// elsewhere it has to be named, and a server that charges is told when one is missing.
function envAddress(name, mainnet, withoutIt) {
  const raw = (env[name] ?? '').trim();
  if (raw === 'off') return null;
  if (validAddress(raw)) return raw.toLowerCase();
  const fallback = mainnet && chainId === 1 ? mainnet.toLowerCase() : null;
  if (raw) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). ${fallback ? `Using the default, ${mainnet}.` : withoutIt}`);
  else if (mainnet && !fallback && (env.PLAN_TREASURY ?? '').trim() && !rpcOff) configWarning(`${name} isn’t set, and its default is a mainnet contract, but NOX_CHAIN_ID is ${chainId}. ${withoutIt}`);
  return fallback;
}

function envFlag(name, fallback) {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  configWarning(`${name}=${raw} isn’t true or false. Using the default, ${fallback}.`);
  return fallback;
}

// A positive decimal like 0.0042, kept as text so no precision is lost on the way to BigInt.
function envDecimal(name, fallback) {
  const raw = (env[name] ?? '').trim();
  if (!raw) return fallback;
  if (/^\d{1,12}(\.\d{1,18})?$/.test(raw) && /[1-9]/.test(raw)) return raw;
  configWarning(`${name}=${raw} isn’t a positive decimal number. ${fallback ? `Using the default, ${fallback}.` : 'Leaving it unset.'}`);
  return fallback;
}

function envUrl(name) {
  const raw = (env[name] ?? '').trim();
  if (!raw) return null;
  try {
    if (['http:', 'https:'].includes(new URL(raw).protocol)) return raw;
  } catch {}
  configWarning(`${name} isn’t an http or https address. Leaving it unset.`);
  return null;
}

// "10000:10,100000:25": staking at least 10,000 NOX takes 10% off, 100,000 takes 25%.
function stakerTiers(raw) {
  if (!raw || raw === 'none') return Object.freeze([]);
  const tiers = raw.split(',').map((entry) => entry.trim().split(':'));
  const valid = tiers.every(([stake, percent]) => /^\d{1,15}$/.test(stake ?? '') && /^\d{1,2}$/.test(percent ?? '') && Number(stake) > 0 && Number(percent) > 0);
  if (!valid) {
    configWarning('PLAN_STAKER_TIERS isn’t a list of stake:percent pairs like 10000:10,100000:25 (percent below 100). Staker discounts are off.');
    return Object.freeze([]);
  }
  return Object.freeze(tiers.map(([stake, percent]) => Object.freeze({ stake, percent: Number(percent) })).sort((a, b) => Number(BigInt(a.stake) - BigInt(b.stake))));
}

// "3/50": this server is workspace number 3 of 50 that share PLAN_TREASURY. Each one then
// draws invoice suffixes from its own share, so no two workspaces can ever ask for the same amount.
function invoiceSlot(raw, digits) {
  if (!raw) return null;
  const match = /^(\d+)\/(\d+)$/.exec(raw);
  const index = match ? Number(match[1]) : NaN;
  const count = match ? Number(match[2]) : NaN;
  if (!(count >= 1 && index < count && Math.floor((10 ** digits - 1) / count) >= 1)) {
    configWarning(`PLAN_INVOICE_SLOT=${raw} isn’t index/count with an index below the count and room for every slot in PLAN_SUFFIX_DIGITS. Invoices fall back to random suffixes.`);
    return null;
  }
  return Object.freeze({ index, count });
}

const suffixDigits = envNumber('PLAN_SUFFIX_DIGITS', 4, { min: 2, max: 6 });
const invoiceKey = (env.PLAN_INVOICE_KEY ?? '').trim();
if (invoiceKey && invoiceKey.length < 16) configWarning('PLAN_INVOICE_KEY is shorter than 16 characters. Use a long random secret.');
const slot = invoiceSlot((env.PLAN_INVOICE_SLOT ?? '').trim(), suffixDigits);
if (slot && !invoiceKey) configWarning('PLAN_INVOICE_SLOT is set without PLAN_INVOICE_KEY, so anyone reading the treasury’s transfers can tell which payments came from the same workspace.');
if ((env.PLAN_PRICE ?? '').trim()) configWarning('PLAN_PRICE is no longer read. Nil Pro is priced in US dollars: set PLAN_PRICE_USD and PLAN_SEAT_USD.');
if ((env.NOX_CONFIRMATIONS ?? '').trim()) configWarning('NOX_CONFIRMATIONS is no longer read. A payment counts once its block is final; see NOX_FINALITY_DEPTH.');

const usdc = envAddress('PLAN_USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'Invoices can’t be paid in USDC until it’s set.');
const billing = Object.freeze({
  priceUsd: envUsd('PLAN_PRICE_USD', '12', { positive: true }),
  seatUsd: envUsd('PLAN_SEAT_USD', '3'),
  usdc: usdc ? Object.freeze({ symbol: 'USDC', address: usdc, decimals: envNumber('PLAN_USDC_DECIMALS', 6, { min: suffixDigits, max: 77 }) }) : null,
  noxDiscount: envNumber('PLAN_NOX_DISCOUNT', 20, { max: 90 }),
  stakerTiers: stakerTiers((env.PLAN_STAKER_TIERS ?? '10000:10,100000:25').trim()),
  invoiceHours: envNumber('PLAN_INVOICE_HOURS', 24, { min: 1, max: 24 * 14 }),
  lateDays: envNumber('PLAN_LATE_DAYS', 7, { max: 90 }),
  invoicesPerDay: envNumber('PLAN_INVOICES_PER_DAY', 10, { min: 1 }),
  suffixDigits,
  // exchanges and many wallets refuse amounts with more decimal places than this
  amountDecimals: envNumber('PLAN_AMOUNT_DECIMALS', 8, { min: suffixDigits, max: 18 }),
  slot,
  invoiceKey: invoiceKey || null,
  logBlocks: envNumber('PLAN_LOG_BLOCKS', 2000, { min: 10 }),
  treasuryName: (env.PLAN_TREASURY_NAME ?? '').trim().slice(0, 60) || 'the treasury',
  remindDays: Object.freeze([...new Set((env.PLAN_REMIND_DAYS || '7,1').split(',').map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => b - a)),
  proForZsp: envFlag('PRO_FOR_ZSP', true),
  perkCheckHours: envNumber('PLAN_PERK_CHECK_HOURS', 6, { min: 1 }),
  burnShare: envNumber('BURN_SHARE', 0, { max: 100 }),
  burnReportUrl: envUrl('BURN_REPORT_URL'),
  oracle: Object.freeze({
    pool: envAddress('PLAN_NOX_POOL', null, 'NOX is priced with PLAN_NOX_USD alone.'),
    weth: envAddress('PLAN_WETH', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'NOX is priced with PLAN_NOX_USD alone.'),
    ethUsdFeed: envAddress('PLAN_ETH_USD_FEED', '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', 'NOX is priced with PLAN_NOX_USD alone.'),
    twapMinutes: envNumber('PLAN_TWAP_MINUTES', 30, { min: 5, max: 24 * 60 }),
    feedMaxAgeMinutes: envNumber('PLAN_FEED_MAX_AGE_MINUTES', 120, { min: 1 }),
    // USD per whole NOX, as decimal text; the oracle's answer must sit between the bounds
    minUsd: envDecimal('PLAN_NOX_USD_MIN', '0.000001'),
    maxUsd: envDecimal('PLAN_NOX_USD_MAX', '1000'),
    manualUsd: envDecimal('PLAN_NOX_USD', null),
  }),
});

// Finality for every token payment: a transfer counts once its block is finalized. Nodes on
// chains without the `finalized` tag fall back to this many blocks under the head.
const finality = Object.freeze({
  depth: envNumber('NOX_FINALITY_DEPTH', 64, { min: 1 }),
});

// Bounty payments start in Nil, which hands out the exact amount to send. That amount stays good
// for this many days (long enough for a multisig to collect its signatures), and a payment that
// was cancelled while stuck is still watched this long in case its transaction lands after all.
const payments = Object.freeze({
  intentDays: envNumber('PAYMENT_INTENT_DAYS', 14, { min: 1, max: 365 }),
  watchDays: envNumber('PAYMENT_WATCH_DAYS', 7, { min: 1, max: 365 }),
});

// The holder door counts NOX held, NOX staked and Zero-State Passes (each worth this many NOX),
// and keeps checking members who came in through it.
const holders = Object.freeze({
  zspWorth: String(envNumber('HOLDER_ZSP_NOX', 100000)),
  recheckHours: envNumber('HOLDER_RECHECK_HOURS', 6, { min: 1 }),
  graceDays: envNumber('HOLDER_GRACE_DAYS', 3),
});

// Anonymous votes (Semaphore). Every proof uses one circuit depth, so one set of circuit files
// serves every group size up to 2^depth voters; `npm run zk:fetch` downloads the matching files.
const semaphore = Object.freeze({
  depth: envNumber('SEMAPHORE_DEPTH', 16, { min: 1, max: 32 }),
});

// Wallet sign-in. Smart-contract wallets are checked on the chain above, and the timeout keeps
// a slow node from holding a sign-in open. A sign-in reset link works once, within its hours.
const signIn = Object.freeze({
  chainTimeoutMs: envNumber('SIGNIN_CHAIN_TIMEOUT_SECONDS', 8, { min: 1, max: 60 }) * SECOND,
  resetHours: envNumber('SIGNIN_RESET_HOURS', 24, { min: 1, max: 168 }),
});

// How often each background job runs.
const jobs = Object.freeze({
  purgeMs: envNumber('JOB_PURGE_SECONDS', 3600, { min: 1 }) * SECOND,
  paymentsMs: envNumber('JOB_PAYMENTS_SECONDS', 60, { min: 1 }) * SECOND,
  votesMs: envNumber('JOB_VOTES_SECONDS', 60, { min: 1 }) * SECOND,
  remindersMs: envNumber('JOB_REMINDERS_SECONDS', 60, { min: 1 }) * SECOND,
  dueAlertsMs: envNumber('JOB_DUE_ALERTS_SECONDS', 60, { min: 1 }) * SECOND,
  optimizeMs: envNumber('JOB_OPTIMIZE_SECONDS', 3600, { min: 1 }) * SECOND,
});

// The app starts with open work and recent history only. Finished tasks (done or canceled)
// touched within these days come along, but never more than the newest `recentClosedMax` of
// them; older ones load when a view asks for them.
const tasks = Object.freeze({
  recentClosedDays: envNumber('RECENT_CLOSED_DAYS', 30),
  recentClosedMax: envNumber('RECENT_CLOSED_MAX', 1000, { min: 1 }),
});

// Web Push. A notification travels through the push service of the browser's maker, encrypted
// so only the person's device can read it. The server only ever posts to the hosts listed here,
// so a subscription can't point it at an arbitrary address. "*." allows any subdomain.
const PUSH_SERVICES = 'fcm.googleapis.com,android.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com,*.notify.windows.com';
const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function pushServices(value) {
  const entries = (value || PUSH_SERVICES).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = entries.filter((entry) => HOST_PATTERN.test(entry));
  if (valid.length < entries.length) configWarning('PUSH_SERVICES has entries that aren’t host names. They are skipped.');
  return Object.freeze(valid);
}

// Push services may contact whoever runs a server that misbehaves. A mailto: or https: address works.
function pushSubject(value, appUrl) {
  if (value) {
    if (/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(value)) return value;
    configWarning('VAPID_SUBJECT must be a mailto: or https: address. It is left out of push requests.');
    return null;
  }
  return appUrl?.startsWith('https://') ? appUrl : null;
}

const push = Object.freeze({
  enabled: env.PUSH_NOTIFICATIONS !== 'off',
  // base64url, as web-push tools print them: the 65-byte public point and the 32-byte private key
  publicKey: env.VAPID_PUBLIC_KEY || null,
  privateKey: env.VAPID_PRIVATE_KEY || null,
  subject: pushSubject(env.VAPID_SUBJECT, app.origin),
  services: pushServices(env.PUSH_SERVICES),
  ttlHours: envNumber('PUSH_TTL_HOURS', 24, { max: 672 }),
});

// When due-soon notes go out: this many minutes before a due time, and at this hour (in the
// person's time zone) on the day a task without a time is due.
const due = Object.freeze({
  soonMinutes: envNumber('DUE_SOON_MINUTES', 30, { min: 1, max: 1440 }),
  dayHour: envNumber('DUE_DAY_HOUR', 9, { max: 23 }),
});

// Personal calendar feeds (ICS). "off" turns the feature off and every existing link with it.
const calendarFeeds = Object.freeze({
  enabled: env.CALENDAR_FEEDS !== 'off',
  perHour: envNumber('CALENDAR_FEED_PER_HOUR', 30, { min: 1 }),
});

const config = Object.freeze({
  production,
  port: envNumber('PORT', 3000, { max: 65535 }),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || null,
  // after a checkpoint SQLite cuts the write-ahead log back to this size instead of keeping its peak
  dbJournalLimitBytes: envNumber('DB_JOURNAL_LIMIT_MB', 64, { min: 1 }) * MB,
  trustProxy: trustProxy(env.TRUST_PROXY),
  appUrl: app.origin,
  sourceUrl: env.SOURCE_URL || null,
  allowedOrigins: Object.freeze(origins),
  setupToken: setupToken((env.SETUP_TOKEN ?? '').trim()),
  shutdownTimeoutMs: envNumber('SHUTDOWN_TIMEOUT_SECONDS', 20, { min: 1 }) * SECOND,
  maxJsonBytes: envNumber('MAX_JSON_KB', 1024, { min: 1 }) * 1024,
  maxUploadBytes: envNumber('MAX_UPLOAD_MB', 25, { min: 1 }) * MB,
  maxCapsuleBytes: envNumber('MAX_CAPSULE_MB', 4096, { min: 1 }) * MB,
  sessionDays: envNumber('SESSION_DAYS', 30, { min: 1 }),
  trashDays: envNumber('TRASH_DAYS', 30),
  readNotificationDays: envNumber('NOTIFICATION_DAYS', 90),
  usedInviteDays: envNumber('USED_INVITE_DAYS', 30),
  jobs,
  nox,
  rewards: rewardTokens((env.REWARD_TOKENS ?? '').trim()),
  plan,
  stealth,
  semaphore,
  tasks,
  power,
  push,
  due,
  calendarFeeds,
  signIn,
  billing,
  finality,
  payments,
  holders,
  ai: Object.freeze({
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    // a hard stop per attempt; retries cover rate limits and brief outages
    timeoutMs: envNumber('AI_TIMEOUT_SECONDS', 120, { min: 1 }) * SECOND,
    maxRetries: envNumber('AI_MAX_RETRIES', 1, { max: 10 }),
  }),
});

// Settings that work but are wrong for a public server. Only production gets these, so a
// laptop running `npm run dev` stays quiet.
if (production) {
  if (config.appUrl.startsWith('https://') && !config.trustProxy) configWarning('APP_URL is https, but TRUST_PROXY is empty. Behind a TLS proxy, cookies lose the Secure flag, HSTS isn’t sent and rate limits see the proxy’s address. Set TRUST_PROXY=1.');
  if (nox.enabled && env.NOX_RPC_URL === DEFAULT_RPC) configWarning(`NOX_RPC_URL is the default public node (${DEFAULT_RPC}), which sees every address and transaction this server looks up, and this server’s IP. Point it at your own node or a provider you trust, or set it to "off".`);
}

const STRICT = ['1', 'true'].includes((env.STRICT_CONFIG ?? '').trim());
if (STRICT && configWarning.count()) {
  const n = configWarning.count();
  log.error('config', `STRICT_CONFIG is on, so the server won’t start until ${n === 1 ? 'the warning above is' : `the ${n} warnings above are`} fixed.`);
  process.exit(1);
}

export default config;
