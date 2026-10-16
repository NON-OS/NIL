import config from '../config.js';
import plan from '../services/plan.js';
import nodeReady from '../chain/nodeReady.js';
import headBlock from '../chain/headBlock.js';
import poolKind from '../chain/poolKind.js';
import pairState from '../chain/pairState.js';
import poolObservations from '../billing/poolObservations.js';

// Every minute, when PLAN_NOX_POOL is a Uniswap V2 pair: records its cumulative prices for the
// time-weighted average NOX is priced at. A V3 pool keeps that history itself. Three windows'
// worth is kept, so a missed minute or a short restart doesn't empty the average.
export default async function recordPoolPrice() {
  const { pool, twapMinutes } = config.billing.oracle;
  if (!config.nox.enabled || !pool || !plan.status().enforced) return;
  await nodeReady();
  if ((await poolKind(pool)) !== 'v2') return;
  const state = await pairState(pool, await headBlock());
  if (state) poolObservations.add(pool, state, 3 * twapMinutes * 60);
}
