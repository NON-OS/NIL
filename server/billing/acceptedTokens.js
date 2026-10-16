import config from '../config.js';

// The tokens an invoice can be paid in: USDC at face value (unless turned off) and NOX.
export default function acceptedTokens() {
  const nox = { symbol: config.nox.symbol, address: config.nox.token, decimals: config.nox.decimals, kind: 'nox' };
  return config.billing.usdc ? [{ ...config.billing.usdc, kind: 'usdc' }, nox] : [nox];
}
