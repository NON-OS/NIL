// Waits until the app inside a workspace answers its /healthz. A workload that keeps not
// running (crashing on start, for example a failed migration) fails fast instead of using up
// the whole timeout.
export default async function waitHealthy(ctx, id, timeoutSec = ctx.config.app.startTimeoutSec) {
  const deadline = ctx.clock.now() + timeoutSec * 1000;
  let down = 0;
  while (true) {
    const status = await ctx.driver.status(id);
    if (status.health === 'healthy') return status;
    if (!status.exists) throw new Error('The workspace’s container is gone.');
    down = status.running ? 0 : down + 1;
    if (down >= 3) throw new Error(`The app stopped while starting (exit code ${status.exitCode ?? 'unknown'}).`);
    if (ctx.clock.now() > deadline) throw new Error(`The app didn’t become healthy within ${timeoutSec} seconds.`);
    await ctx.clock.sleep(ctx.pollMs);
  }
}
