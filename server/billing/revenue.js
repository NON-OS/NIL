import sql from '../db/sql.js';
import config from '../config.js';
import acceptedTokens from './acceptedTokens.js';

// What this workspace has paid the treasury for Nil Pro, settled payments only, with the
// published share that goes to buying and burning NOX. The burn itself happens outside the app.
export default function revenue() {
  const known = new Map(acceptedTokens().map((t) => [t.address, t]));
  const totals = new Map();
  let usd = 0;
  for (const p of sql.all("SELECT token, amount, usd FROM billing_payments WHERE status = 'final'")) {
    // payments from before invoices were always NOX and have no token column
    const token = p.token ?? config.nox.token;
    totals.set(token, (totals.get(token) ?? 0n) + BigInt(p.amount ?? 0));
    usd += p.usd ?? 0;
  }
  const tokens = [...totals].map(([token, amount]) => {
    const t = known.get(token) ?? { symbol: token === config.nox.token ? config.nox.symbol : 'tokens', decimals: token === config.nox.token ? config.nox.decimals : 18 };
    return { token, symbol: t.symbol, decimals: t.decimals, amount: String(amount) };
  });
  return {
    treasury: config.plan.treasury,
    treasuryName: config.billing.treasuryName,
    burnShare: config.billing.burnShare,
    burnReportUrl: config.billing.burnReportUrl,
    tokens,
    usd,
    burnUsd: Math.floor((usd * config.billing.burnShare) / 100),
  };
}
