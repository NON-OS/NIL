import states from '../provisioning/states.js';

const STALE_MS = 3_600_000;

// An operation can't survive the process running it. Sign-ups provision inside the server, so
// when the server starts (`startup`), every first provisioning a server holds or nobody holds
// was cut off: it is marked failed and the operator told, and `resume` retries it. The CLI's own
// operations hold a lock with a live lease and are left alone. Run hourly as well, it reports
// anything that has sat in a busy state for over an hour with no live lock behind it.
export default async function recoverInterrupted(ctx, { startup = false } = {}) {
  const now = ctx.store.now();
  const found = [];
  for (const workspace of ctx.store.workspaces.list({ states: states.busy })) {
    const lock = ctx.store.locks.get(workspace.id);
    const orphaned = !lock || lock.expiresAt <= now || (startup && lock.holder.startsWith('server:') && !lock.holder.startsWith(`${ctx.lockHolder}/`));
    if (!orphaned) continue;
    const stale = now - workspace.updatedAt > STALE_MS;
    if (workspace.state === 'provisioning' && (startup || stale)) {
      if (!ctx.store.workspaces.transition(workspace.id, ['provisioning'], 'failed')) continue;
      if (lock) ctx.store.locks.release(workspace.id, lock.holder);
      ctx.store.events.add(workspace.id, 'provision_interrupted');
      found.push(workspace.name);
      await ctx.alert('workspace.provision_interrupted', { workspace, message: 'Its creation was cut off before it finished. It is marked failed; `resume` tries again.' });
    } else if (stale) {
      found.push(workspace.name);
      await ctx.alert('workspace.stuck', { workspace, message: `It has been ${workspace.state} for over an hour and nothing is working on it.` });
    }
  }
  return found;
}
