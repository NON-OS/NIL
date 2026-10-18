import workspaceSpec from '../runtime/workspaceSpec.js';
import states from '../provisioning/states.js';

const HOUR = 3_600_000;

// Watches every running workspace through its /healthz (Docker runs the check inside the
// container; this reads the result). A workspace that is unhealthy or not running for
// CLOUD_HEALTH_FAILURES checks in a row is restarted and the operator told. One that needs more
// than CLOUD_MAX_RESTARTS_PER_HOUR restarts is left alone with a critical alert: restarting in
// a loop would hide whatever is wrong with it. A workspace whose Ethereum node was caught in a
// false answer by Nil's verifier is a critical alert of its own, once for each time it happens.
export default function createHealthCheck(ctx) {
  const strikes = new Map();
  const mismatches = new Map();
  const restarts = new Map();
  const givenUp = new Set();

  return async function checkHealth() {
    const now = ctx.store.now();
    const { failures, maxRestartsPerHour } = ctx.config.health;
    await ctx.driver.ensureProxy(ctx.store.workspaces.list({ states: states.routed }).map((w) => w.id)).catch((err) => ctx.log.warn('proxy.attach_failed', { error: err }));

    for (const workspace of ctx.store.workspaces.list({ states: ['active'] })) {
      let status;
      try {
        status = await ctx.driver.status(workspace.id);
      } catch (err) {
        ctx.log.warn('health.status_failed', { workspace: workspace.id, error: err });
        continue;
      }
      const caught = status.report?.chainMismatchAt;
      if (caught && caught !== mismatches.get(workspace.id)) {
        mismatches.set(workspace.id, caught);
        await ctx.alert('workspace.chain_mismatch', { workspace, severity: 'critical', repeatMin: 0, message: `Nil’s verifier caught the Ethereum node in a false answer at ${new Date(caught).toISOString()}. ${ctx.config.app.verifierMode === 'enforce' ? 'The workspace threw it away; check the node.' : 'In shadow mode the workspace acted on it: check the node, and the workspace’s recent payments and votes.'}` });
      }
      if (status.health === 'healthy') {
        strikes.delete(workspace.id);
        givenUp.delete(workspace.id);
        if (!workspace.lastHealthyAt || now - workspace.lastHealthyAt > 10 * 60_000) ctx.store.workspaces.update(workspace.id, { lastHealthyAt: now });
        continue;
      }
      // Docker restarts a crashed app by itself; give it its start period before counting
      if (status.running && status.health === 'starting') continue;
      const count = (strikes.get(workspace.id) ?? 0) + 1;
      strikes.set(workspace.id, count);
      if (count < failures) continue;
      strikes.delete(workspace.id);

      const recent = (restarts.get(workspace.id) ?? []).filter((at) => now - at < HOUR);
      restarts.set(workspace.id, recent);
      if (recent.length >= maxRestartsPerHour) {
        if (!givenUp.has(workspace.id)) {
          givenUp.add(workspace.id);
          await ctx.alert('workspace.down', { workspace, severity: 'critical', message: `Restarted ${recent.length} times in the last hour and still not healthy. Automatic restarts are paused for an hour; check its logs.` });
        }
        continue;
      }
      const what = !status.exists ? 'its container was missing' : status.running ? `it was ${status.health}` : 'it wasn’t running';
      try {
        if (status.exists) {
          await ctx.driver.restart(workspace.id);
        } else {
          await ctx.driver.create(workspaceSpec(ctx.config, workspace));
          await ctx.driver.start(workspace.id);
        }
        recent.push(now);
        ctx.store.events.add(workspace.id, 'auto_restart', what);
        await ctx.alert('workspace.restarted', { workspace, message: `Restarted automatically: ${what}.` });
      } catch (err) {
        await ctx.alert('workspace.restart_failed', { workspace, severity: 'critical', message: `${what}, and restarting it failed: ${err.message}` });
      }
    }
  };
}
