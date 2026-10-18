import HttpError from '../lib/HttpError.js';
import randomToken from '../lib/randomToken.js';

// Runs one operation on a workspace while holding its lock in the control database, so a
// backup never reads a volume an upgrade or rollback is rewriting, whichever process (server or
// CLI) runs each. A taken lock is waited for up to CLOUD_LOCK_WAIT_SEC. The lease is renewed
// while the operation runs, and runs out by itself if the process holding it dies.
export default async function withLock(ctx, workspaceId, operation, run) {
  const { lockLeaseSec, lockWaitSec } = ctx.config.lifecycle;
  // one holder per call, so two operations in the same process exclude each other too
  const holder = `${ctx.lockHolder}/${randomToken(6)}`;
  const until = () => ctx.store.now() + lockLeaseSec * 1000;
  const deadline = ctx.clock.now() + lockWaitSec * 1000;
  while (!ctx.store.locks.take(workspaceId, holder, operation, until())) {
    if (ctx.clock.now() >= deadline) {
      const held = ctx.store.locks.get(workspaceId);
      throw new HttpError(409, `Another operation (${held?.operation ?? 'unknown'}) is running on this workspace. Try again once it has finished.`, { busy: true });
    }
    await ctx.clock.sleep(ctx.pollMs);
  }
  const renew = setInterval(() => ctx.store.locks.take(workspaceId, holder, operation, until()), (lockLeaseSec * 1000) / 3);
  renew.unref();
  try {
    return await run();
  } finally {
    clearInterval(renew);
    ctx.store.locks.release(workspaceId, holder);
  }
}
