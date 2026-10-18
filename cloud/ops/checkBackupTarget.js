// At startup: whether the backups would survive someone who takes over this server. Only an S3
// bucket can say so itself. It needs versioning, so writing an object never replaces the old
// one, and Object Lock in compliance mode for at least CLOUD_BACKUP_KEEP_DAYS, so no key, the
// server's included, can delete a version before then. A file target (a Storage Box) can't be
// checked from here; its snapshots are set up in Robot (see the README).
export default async function checkBackupTarget(ctx) {
  if (!ctx.backupTarget?.protection) return null;
  let state;
  try {
    state = await ctx.backupTarget.protection();
  } catch (err) {
    // the key may not be allowed to read bucket settings; nothing is wrong with the backups
    ctx.log.warn('backup.protection_unknown', { error: err });
    return null;
  }
  const { keepDays } = ctx.config.backup;
  const problems = [];
  if (!state.versioning) problems.push('versioning is off, so this server’s key can overwrite any backup');
  if (!state.objectLock) problems.push('Object Lock is off, so this server’s key can delete them');
  else if (state.mode !== 'COMPLIANCE' || state.days < keepDays) problems.push(`its default retention is ${state.mode ?? 'unset'} for ${state.days} days, not compliance for at least ${keepDays}`);
  if (problems.length) await ctx.alert('backup.target_unprotected', { message: `The backup bucket can’t survive a compromised server: ${problems.join('; ')}. See cloud/README.md, step 4.` });
  else ctx.log.info('backup.target_protected', { days: state.days });
  return { ...state, problems };
}
