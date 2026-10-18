import deleteWorkspace from '../provisioning/deleteWorkspace.js';
import suspendWorkspace from '../provisioning/suspendWorkspace.js';
import states from '../provisioning/states.js';

const DAY = 86_400_000;
// writes in the first minutes after a start are the app's own (migrations, query statistics)
const SETTLE_MS = 15 * 60_000;

// Hourly: a claimed workspace whose data hasn't changed in CLOUD_IDLE_DAYS is paused, and its
// address shows a notice saying so and until when. If nobody asks for it back within
// CLOUD_IDLE_NOTICE_DAYS, it is deleted like any other: a final encrypted backup, then the grace
// period. "Changed" is read from the modification time of its database files, never from what
// is in them, and the minutes after a restart don't count. Without this, a name and a place on
// the server, claimed once, would stay taken forever.
export default async function checkIdle(ctx) {
  const { idleDays, idleNoticeDays } = ctx.config.signup;
  if (!idleDays) return;
  const now = ctx.store.now();
  for (const workspace of ctx.store.workspaces.list({ states: ['active'] }).filter((w) => w.claimedAt)) {
    const write = await ctx.driver.lastWrite(workspace.id).catch((err) => ctx.log.warn('idle.check_failed', { workspace: workspace.id, error: err }));
    const changed = write?.at && write.startedAt && write.at > write.startedAt + SETTLE_MS ? write.at : 0;
    const activeAt = Math.max(workspace.activeAt ?? 0, workspace.claimedAt, Math.min(changed, now));
    if (activeAt !== workspace.activeAt) ctx.store.workspaces.update(workspace.id, { activeAt });
    if (now - activeAt < idleDays * DAY) continue;
    try {
      await suspendWorkspace(ctx, workspace.id, states.reasons.idle);
      await ctx.alert('workspace.idle_paused', { workspace, message: `Its data hasn’t changed in ${idleDays} days, so it is paused with a notice. It is deleted in ${idleNoticeDays} days unless its owner asks for it back (resume).` });
    } catch (err) {
      ctx.log.warn('idle.pause_failed', { workspace: workspace.id, error: err });
    }
  }
  const due = ctx.store.workspaces.list({ states: ['suspended'] }).filter((w) => w.suspendReason === states.reasons.idle && now - w.suspendedAt >= idleNoticeDays * DAY);
  for (const workspace of due) {
    try {
      await deleteWorkspace(ctx, workspace.id);
      await ctx.alert('workspace.idle_deleting', { workspace, message: `Nobody asked for it back within ${idleNoticeDays} days, so it is scheduled for deletion (resume still cancels it during the grace period).` });
    } catch (err) {
      await ctx.alert('workspace.idle_delete_failed', { workspace, message: err.message });
    }
  }
}
