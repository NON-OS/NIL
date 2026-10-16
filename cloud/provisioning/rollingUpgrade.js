import upgradeWorkspace from './upgradeWorkspace.js';

// Upgrades running workspaces one after another. Each failure has already been rolled back by
// upgradeWorkspace; once more than `maxFailures` fail, the rest are left alone, since a version
// that breaks several workspaces will most likely break them all.
export default async function rollingUpgrade(ctx, image, { ids, maxFailures = ctx.config.lifecycle.upgradeMaxFailures, onResult = () => {} } = {}) {
  const targets = ids ? ids.map((id) => ctx.store.workspaces.get(id)).filter(Boolean) : ctx.store.workspaces.list();
  const summary = { upgraded: [], skipped: [], failed: [], untouched: [] };
  for (const workspace of targets) {
    if (summary.failed.length > maxFailures) {
      summary.untouched.push({ name: workspace.name });
      continue;
    }
    const outcome = await upgradeWorkspace(ctx, workspace.id, image);
    const entry = { name: workspace.name, ...outcome };
    onResult(entry);
    if (outcome.result === 'upgraded') summary.upgraded.push(entry);
    else if (outcome.result === 'skipped') summary.skipped.push(entry);
    else summary.failed.push(entry);
  }
  if (summary.untouched.length) await ctx.alert('upgrade.halted', { message: `Rolling upgrade to ${image} stopped after ${summary.failed.length} failures; ${summary.untouched.length} workspaces were left on their current version.` });
  return summary;
}
