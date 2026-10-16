import net from 'node:net';
import path from 'node:path';
import envNumber from './lib/envNumber.js';
import configWarning from './lib/configWarning.js';
import refuseToStart from './lib/refuseToStart.js';

// Every setting is optional except APP_URL, and NOX_RPC_URL on a server reached over the network.
// An empty value counts as unset. A value that is set but can't be used gets the default, or
// turns its feature off, and says so in a warning at startup.
const env = process.env;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Where people reach this server. Wallet sign-in messages name this domain and only this origin
// may make changes, so it can never be read from request headers, where a phishing site would put
// its own. Plain http is accepted only on this machine and for .onion addresses, which Tor
// already authenticates. These two settings are required, so a bad value stops the server.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PUBLIC_RPC = 'https://ethereum-rpc.publicnode.com';

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
  configWarning(`NOX_RPC_URL isn’t set, so this local server uses the public node at ${PUBLIC_RPC}, which sees every address it looks up. Set your own node, or off, before others use this server.`);
  return PUBLIC_RPC;
}

const app = site((env.APP_URL ?? '').trim());

const origins = (env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
origins.push(app.origin);

// Tokens a team can pay bounties in, as SYMBOL:address:decimals pairs. NOX always comes first.
function rewardTokens(value, nox) {
  const listed = (value || 'USDC:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:6')
    .split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([symbol, address, decimals]) => symbol && ADDRESS.test(address ?? '') && Number.isInteger(Number(decimals)))
    .map(([symbol, address, decimals]) => Object.freeze({ symbol: symbol.toUpperCase(), address: address.toLowerCase(), decimals: Number(decimals) }));
  return Object.freeze([Object.freeze({ symbol: nox.symbol, address: nox.token, decimals: nox.decimals }), ...listed.filter((t) => t.symbol !== nox.symbol)]);
}

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

// NOX lives on Ethereum. The RPC node sees which addresses we look up, so privacy-minded
// teams should point NOX_RPC_URL at their own node. "off" disables every on-chain feature.
const nox = Object.freeze({
  enabled: env.NOX_RPC_URL !== 'off',
  rpcUrl: rpcUrl(env.NOX_RPC_URL, app.local),
  token: (env.NOX_TOKEN || '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca').toLowerCase(),
  chainId: envNumber('NOX_CHAIN_ID', 1, { min: 1 }),
  symbol: env.NOX_SYMBOL || 'NOX',
  // token amounts fit in 256 bits, so more decimals than 77 can't mean anything
  decimals: envNumber('NOX_DECIMALS', 18, { max: 77 }),
  confirmations: envNumber('NOX_CONFIRMATIONS', 3),
  explorer: explorer(env.NOX_EXPLORER),
});

// The NOX subscription. With no treasury set the server runs in community mode: every utility
// is on, as the AGPL lets anyone choose anyway. Hosted and official servers set a treasury.
const DEFAULT_PRICE = '1000';

// Whole NOX, decimals allowed, in the token's smallest unit. Zero isn't a price: a period that
// costs nothing could never be counted.
function toUnits(value, decimals) {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0');
  return units > 0n ? units.toString() : null;
}

// A treasury that can't be used means community mode, said out loud. The value isn't repeated
// in the warning: a private key pasted here by mistake must not end up in the logs.
function planTreasury(value) {
  if (!value) return null;
  if (!ADDRESS.test(value)) {
    configWarning('PLAN_TREASURY is set but isn’t an Ethereum address (0x and 40 hex characters). The subscription is off and every tool is unlocked (community mode) until it’s fixed.');
    return null;
  }
  if (!nox.enabled) configWarning('PLAN_TREASURY is set, but NOX_RPC_URL is off, so payments can’t be checked. The subscription is off and every tool is unlocked (community mode).');
  return value.toLowerCase();
}

function planPrice(value) {
  const price = toUnits(value || DEFAULT_PRICE, nox.decimals);
  if (price) return price;
  configWarning(`PLAN_PRICE=${value} isn’t a positive amount of whole ${nox.symbol}. Using the default, ${DEFAULT_PRICE}.`);
  return toUnits(DEFAULT_PRICE, nox.decimals);
}

const plan = Object.freeze({
  treasury: planTreasury((env.PLAN_TREASURY ?? '').trim()),
  price: planPrice((env.PLAN_PRICE ?? '').trim()),
  periodDays: envNumber('PLAN_PERIOD_DAYS', 30, { min: 1 }),
  graceDays: envNumber('PLAN_GRACE_DAYS', 7),
  freeSeats: envNumber('PLAN_FREE_SEATS', 5),
  maxPeriods: envNumber('PLAN_MAX_PERIODS', 24, { min: 1 }),
  trialDays: envNumber('PLAN_TRIAL_DAYS', 14),
});

// Private payouts (ERC-5564 stealth addresses). The announcer is the standard's singleton, the
// same address on every chain it's deployed to. The top-up is ETH the payer sends along so the
// contributor can move the tokens without first funding the one-time address from a known wallet.
const stealth = Object.freeze({
  announcer: (ADDRESS.test(env.STEALTH_ANNOUNCER ?? '') ? env.STEALTH_ANNOUNCER : '0x55649E01B5Df198D18D95b5cc5051630cfD45564').toLowerCase(),
  gasTopUpWei: /^\d+$/.test(env.STEALTH_GAS_TOPUP_WEI ?? '') ? env.STEALTH_GAS_TOPUP_WEI : '300000000000000',
  // how long a confirmed payout keeps being checked for a late announcement
  announceCheckDays: envNumber('STEALTH_ANNOUNCE_CHECK_DAYS', 7),
  // payout balances are looked up one address at a time, at random moments within this window
  balanceSpreadMs: envNumber('STEALTH_BALANCE_SPREAD_SECONDS', 1800, { min: 1 }) * 1000,
});

// Voting power: NOX in linked wallets, plus NOX staked in the official staking contract, plus a
// fixed amount of power per Zero-State Pass (ZSP). Admins can change the ZSP power per workspace;
// this is the default. "off" leaves a source out.
const contract = (value, fallback) => (value === 'off' ? null : (ADDRESS.test(value ?? '') ? value : fallback).toLowerCase());
const power = Object.freeze({
  staking: contract(env.NOX_STAKING, '0xa94d6009790Ba13597A1E1b7cF4e1531eA513613'),
  zsp: contract(env.ZSP_CONTRACT, '0x7b575dd8e8b111c52ab1e872924d4efd4df403df'),
  zspPower: /^\d+$/.test(env.VOTE_ZSP_POWER ?? '') ? env.VOTE_ZSP_POWER : '100000',
});

// Anonymous votes (Semaphore). Every proof uses one circuit depth, so one set of circuit files
// serves every group size up to 2^depth voters; `npm run zk:fetch` downloads the matching files.
const semaphore = Object.freeze({
  depth: envNumber('SEMAPHORE_DEPTH', 16, { min: 1, max: 32 }),
});

const config = Object.freeze({
  port: envNumber('PORT', 3000, { max: 65535 }),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || null,
  trustProxy: trustProxy(env.TRUST_PROXY),
  appUrl: app.origin,
  sourceUrl: env.SOURCE_URL || null,
  allowedOrigins: Object.freeze(origins),
  maxUploadBytes: envNumber('MAX_UPLOAD_MB', 25, { min: 1 }) * 1024 * 1024,
  maxCapsuleBytes: envNumber('MAX_CAPSULE_MB', 4096, { min: 1 }) * 1024 * 1024,
  sessionDays: envNumber('SESSION_DAYS', 30, { min: 1 }),
  trashDays: envNumber('TRASH_DAYS', 30),
  nox,
  rewards: rewardTokens(env.REWARD_TOKENS, nox),
  plan,
  stealth,
  semaphore,
  power,
  ai: Object.freeze({
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  }),
});

export default config;
