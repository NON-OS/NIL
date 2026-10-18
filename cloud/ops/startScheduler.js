import backupAll from '../backups/backupAll.js';
import collectUsage from './collectUsage.js';
import checkClaims from './checkClaims.js';
import checkBilling from './checkBilling.js';
import checkHost from './checkHost.js';
import housekeeping from './housekeeping.js';
import checkIdle from './checkIdle.js';
import createHealthCheck from './createHealthCheck.js';
import nextDailyRun from './nextDailyRun.js';

// Runs the background jobs. A job never overlaps with itself: if the previous run is still
// going (a slow backup, a hung Docker call) the next tick is skipped rather than stacked.
export default function startScheduler(ctx) {
  const timers = [];
  const job = (name, fn) => {
    let busy = false;
    return async () => {
      if (busy) return;
      busy = true;
      try {
        await fn();
      } catch (err) {
        ctx.log.error(`job.failed`, { job: name, error: err });
      } finally {
        busy = false;
      }
    };
  };
  const every = (ms, run) => {
    timers.push(setInterval(run, ms));
    return run;
  };

  const health = createHealthCheck(ctx);
  every(ctx.config.health.intervalSec * 1000, job('health', async () => {
    await health();
    await checkHost(ctx);
    // costs nothing when the routes are current; after a reload Caddy refused (or missed while
    // it restarted) it tries again, so the routes always catch up with the database
    await ctx.routes.sync().catch(() => {});
  }));
  const usage = every(ctx.config.usage.intervalMin * 60_000, job('usage', async () => {
    await collectUsage(ctx);
    await checkClaims(ctx);
    await checkBilling(ctx);
  }));
  const hourly = every(3_600_000, job('housekeeping', async () => {
    await housekeeping(ctx);
    await checkIdle(ctx);
  }));
  // a first pass soon after start, without waiting a full interval
  timers.push(setTimeout(() => (usage(), hourly()), 30_000));

  if (ctx.backups && ctx.config.backup.time) {
    const run = job('backup', () => backupAll(ctx));
    const plan = () => {
      const at = nextDailyRun(Date.now(), ctx.config.backup.time);
      ctx.log.info('backup.scheduled', { at: new Date(at).toISOString() });
      timers.push(setTimeout(async () => {
        await run();
        plan();
      }, at - Date.now()));
    };
    plan();
  }

  return () => timers.forEach((t) => clearTimeout(t));
}
