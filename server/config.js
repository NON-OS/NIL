import path from 'node:path';

const env = process.env;

const origins = (env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (env.APP_URL) origins.push(env.APP_URL.replace(/\/$/, ''));

// Tokens a team can pay bounties in, as SYMBOL:address:decimals pairs. NOX always comes first.
function rewardTokens(value, nox) {
  const listed = (value || 'USDC:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:6')
    .split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(([symbol, address, decimals]) => symbol && /^0x[0-9a-fA-F]{40}$/.test(address ?? '') && Number.isInteger(Number(decimals)))
    .map(([symbol, address, decimals]) => Object.freeze({ symbol: symbol.toUpperCase(), address: address.toLowerCase(), decimals: Number(decimals) }));
  return Object.freeze([Object.freeze({ symbol: nox.symbol, address: nox.token, decimals: nox.decimals }), ...listed.filter((t) => t.symbol !== nox.symbol)]);
}

function trustProxy(value) {
  if (!value) return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

// NOX lives on Ethereum. The RPC node sees which addresses we look up, so privacy-minded
// teams should point NOX_RPC_URL at their own node. "off" disables every on-chain feature.
const nox = Object.freeze({
  enabled: env.NOX_RPC_URL !== 'off',
  rpcUrl: env.NOX_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  token: (env.NOX_TOKEN || '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca').toLowerCase(),
  chainId: Number(env.NOX_CHAIN_ID || 1),
  symbol: env.NOX_SYMBOL || 'NOX',
  decimals: Number(env.NOX_DECIMALS || 18),
  confirmations: Number(env.NOX_CONFIRMATIONS || 3),
  explorer: (env.NOX_EXPLORER || 'https://etherscan.io').replace(/\/$/, ''),
});

// The NOX subscription. With no treasury set the server runs in community mode: every utility
// is on, as the AGPL lets anyone choose anyway. Hosted and official servers set a treasury.
function planPrice(value, decimals) {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

const plan = Object.freeze({
  treasury: /^0x[0-9a-fA-F]{40}$/.test(env.PLAN_TREASURY ?? '') ? env.PLAN_TREASURY.toLowerCase() : null,
  price: planPrice(env.PLAN_PRICE || '1000', nox.decimals),
  periodDays: Number(env.PLAN_PERIOD_DAYS || 30),
  graceDays: Number(env.PLAN_GRACE_DAYS || 7),
  freeSeats: Number(env.PLAN_FREE_SEATS || 5),
  maxPeriods: Number(env.PLAN_MAX_PERIODS || 24),
  trialDays: Number(env.PLAN_TRIAL_DAYS ?? 14),
});

const config = Object.freeze({
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || null,
  trustProxy: trustProxy(env.TRUST_PROXY),
  appUrl: env.APP_URL ? env.APP_URL.replace(/\/$/, '') : null,
  sourceUrl: env.SOURCE_URL || null,
  allowedOrigins: Object.freeze(origins),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
  sessionDays: Number(env.SESSION_DAYS || 30),
  trashDays: Number(env.TRASH_DAYS || 30),
  nox,
  rewards: rewardTokens(env.REWARD_TOKENS, nox),
  plan,
  ai: Object.freeze({
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  }),
});

export default config;
