// The live chain check in a real browser: the same on-chain flows, driven through Nil's own
// screens with a wallet injected into Chromium that signs with real keys and sends real
// transactions to the local mainnet fork. Opt-in and slow; see "Live chain checks" in
// docs/development.md. Needs `npm run build` first, and a Chromium for
// Playwright (CHROMIUM_PATH, or `npx playwright-core install chromium`).
//
//   ANVIL=/path/to/anvil node scripts/live/chain/checkBrowser.mjs
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import liveContext from './liveContext.mjs';
import steps from './browser/steps.mjs';

const ctx = await liveContext();
ctx.people = {};
ctx.browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
console.log(`Nil at ${ctx.nil.base}, chain ${ctx.chainId}, server log ${ctx.nil.logFile}`);

let failed = 0;
for (const [name, step] of Object.entries(steps)) {
  const started = Date.now();
  try {
    await ctx.chain.syncClock();
    await step(ctx);
    const problems = Object.values(ctx.people).flatMap((p) => p.problems.splice(0));
    if (problems.length) throw new Error(`the page reported problems:\n  ${problems.join('\n  ')}`);
    console.log(`ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err.stack ?? err}`);
    for (const person of Object.values(ctx.people)) {
      const file = path.join(os.tmpdir(), `nil-live-${name}-${person.name}.png`);
      await person.page.screenshot({ path: file, fullPage: true }).catch(() => {});
      console.log(`      screenshot: ${file}`);
    }
    break;
  }
}
await ctx.browser.close();
await ctx.stop();
console.log(failed ? 'the browser check failed' : 'all browser steps passed');
process.exit(failed ? 1 : 0);
