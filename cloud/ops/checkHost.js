import fs from 'node:fs';

// Two things that take every workspace down at once and are easy to miss on a dedicated
// server: a RAID mirror running on one disk, and the disk filling up. /proc/mdstat is not
// namespaced, so this works from inside the control plane's container too.
export default async function checkHost(ctx, { mdstat = '/proc/mdstat' } = {}) {
  let degraded = [];
  try {
    const text = fs.readFileSync(mdstat, 'utf8');
    // a status line like "[2/1] [U_]": each underscore is a missing or failed member
    degraded = [...text.matchAll(/^(md\w+)\s*:[^\n]*\n[^\n]*\[([U_]+)\]/gm)].filter((m) => m[2].includes('_')).map((m) => m[1]);
  } catch {
    // no software RAID on this machine
  }
  if (degraded.length) await ctx.alert('host.raid_degraded', { severity: 'critical', message: `RAID array ${degraded.join(', ')} is degraded. Replace the failed disk soon.` });

  const stats = fs.statfsSync(ctx.config.dataDir);
  const freePercent = (stats.bavail / stats.blocks) * 100;
  if (freePercent < ctx.config.health.diskFreeAlertPercent) {
    await ctx.alert('host.disk_low', { severity: freePercent < 5 ? 'critical' : 'warning', message: `Only ${freePercent.toFixed(1)}% of the disk holding the workspaces is free.` });
  }
  return { degraded, freePercent };
}
