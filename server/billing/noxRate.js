import config from '../config.js';
import decimalUnits from '../lib/decimalUnits.js';
import nodeReady from '../chain/nodeReady.js';
import oracleRate from './oracleRate.js';

// The NOX/USD rate an invoice locks in: the on-chain oracle when it answers inside the sanity
// bounds, otherwise the operator's manual rate. Null when neither is available, and then
// invoices are offered in USDC only.
export default async function noxRate() {
  const { minUsd, maxUsd, manualUsd } = config.billing.oracle;
  let rate = null;
  try {
    await nodeReady();
    rate = await oracleRate();
  } catch {
    // an unreachable node is the same as no oracle answer: fall back
  }
  if (rate !== null && rate >= decimalUnits(minUsd, 18) && rate <= decimalUnits(maxUsd, 18)) return { rate, source: 'oracle' };
  if (manualUsd) return { rate: decimalUnits(manualUsd, 18), source: 'manual' };
  return null;
}
