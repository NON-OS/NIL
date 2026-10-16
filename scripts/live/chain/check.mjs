// The live chain check: every on-chain flow of Nil, end to end, against a local fork of Ethereum
// mainnet with the real contracts and real signed transactions. Opt-in and slow; not part of
// npm test. See "Live chain checks" in docs/development.md.
//
//   ANVIL=/path/to/anvil node scripts/live/chain/check.mjs [flow ...]
//
// Names on the command line run only those flows. Sign-in and Nil Pro always run first, since
// the others need the people and the paid plan they leave behind. LIVE_CHAIN_RPC reuses an anvil
// fork that's already running instead of starting one.
import liveContext from './liveContext.mjs';
import flows from './flows/index.mjs';

const wanted = process.argv.slice(2);
const ctx = await liveContext();
ctx.people = {};
console.log(`Nil at ${ctx.nil.base}, chain ${ctx.chainId} via ${ctx.proxy.url}, server log ${ctx.nil.logFile}`);

let failed = 0;
for (const [name, flow] of Object.entries(flows)) {
  if (wanted.length && !['signIn', 'pro'].includes(name) && !wanted.includes(name)) continue;
  const started = Date.now();
  try {
    await ctx.chain.syncClock();
    await flow(ctx);
    console.log(`ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err.stack ?? err}`);
    if (['signIn', 'pro'].includes(name)) break;
  }
}
await ctx.stop();
console.log(failed ? `${failed} flow(s) failed` : 'all flows passed');
process.exit(failed ? 1 : 0);
