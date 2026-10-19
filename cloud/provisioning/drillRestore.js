import newWorkspaceId from '../lib/newWorkspaceId.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import restoreImage from './restoreImage.js';
import waitHealthy from './waitHealthy.js';

// A restore drill: the backup goes into a throwaway workspace that exists only for the drill.
// It is never written to the control database, so it is never routed, gets no certificate and
// no setup code, and nobody can open it. Its network is internal with Caddy left off, so it has
// no way in or out at all, and the chain is off. It is started and has to pass its health
// check, which proves the database in the backup opens (and migrates), and then it is removed
// with its volume, whatever happened. A customer's data is never published by a drill.
//
// The copy's volume holds the backup decrypted, so its removal is never assumed: `removed` says
// whether it really went, `leftovers` names what didn't and how to remove it, and a copy that
// stays raises a critical alert.
export default async function drillRestore(ctx, { tar, manifest = null }) {
  const id = newWorkspaceId();
  const image = await restoreImage(ctx, manifest?.image);
  const base = workspaceSpec(ctx.config, { id, name: 'restore-drill', image, volume: `nil-${id}-drill`, plan: ctx.config.defaultPlan, invoiceSlot: null });
  const { PLAN_TREASURY, PLAN_INVOICE_SLOT, PLAN_INVOICE_KEY, ...env } = base.env;
  // a uid of its own, just below every workspace's
  const uid = ctx.config.app.uidBase ? ctx.config.app.uidBase - 1 : 1000;
  const spec = { ...base, isolated: true, user: `${uid}:${uid}`, env: { ...env, NOX_RPC_URL: 'off', PUSH_NOTIFICATIONS: 'off' } };
  ctx.log.info('drill.started', { workspace: id, image });
  let outcome = null;
  let failure = null;
  try {
    await ctx.driver.ensureImage(image);
    await ctx.driver.create(spec);
    await ctx.driver.importData(id, tar);
    await ctx.driver.start(id);
    const status = await waitHealthy(ctx, id);
    ctx.log.info('drill.passed', { workspace: id, image });
    outcome = { id, image, report: status.report };
  } catch (err) {
    failure = err;
  }

  let leftovers = null;
  try {
    await ctx.driver.destroy(id, [spec.volume]);
  } catch (err) {
    leftovers = err.leftovers ?? { containers: [], networks: [], volumes: [spec.volume], commands: [] };
    const what = [...leftovers.containers, ...leftovers.networks, ...leftovers.volumes].join(', ');
    ctx.log.error('drill.cleanup_failed', { workspace: id, error: err });
    await ctx.alert('drill.cleanup_failed', {
      severity: 'critical',
      repeatMin: 0,
      message: `A restore drill couldn’t remove its throwaway copy, which holds a decrypted backup: ${what}. Remove it now${leftovers.commands.length ? `: ${leftovers.commands.join('; ')}` : ''}.`,
    });
  }

  if (failure) {
    if (!leftovers) throw failure;
    throw new Error(`${failure.message} Its decrypted copy couldn’t be removed either; remove it now${leftovers.commands.length ? `: ${leftovers.commands.join('; ')}` : ''}.`, { cause: failure });
  }
  return { ...outcome, removed: !leftovers, leftovers };
}
