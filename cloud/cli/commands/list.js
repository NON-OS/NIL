import table from '../table.js';
import shortAddress from '../shortAddress.js';
import formatBytes from '../../lib/formatBytes.js';

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

export default async function list(ctx, { options, print }) {
  const usage = ctx.store.usage.all();
  const workspaces = ctx.store.workspaces.list(options.state ? { states: [options.state] } : undefined);
  if (options.json) {
    // setup tokens never leave through list, not even as JSON
    print(JSON.stringify(workspaces.map(({ setupToken, ...w }) => ({ ...w, claimed: Boolean(w.claimedAt), usage: usage.get(w.id) ?? null, lastBackup: ctx.store.backups.latest(w.id) ?? null })), null, 2));
    return 0;
  }
  if (!workspaces.length) {
    print('No workspaces yet.');
    return 0;
  }
  const rows = workspaces.map((w) => {
    const u = usage.get(w.id);
    const backup = ctx.store.backups.latest(w.id);
    return [w.name, w.state, w.plan, w.image, day(w.createdAt), day(w.suspendedAt), u ? formatBytes(u.diskBytes) : '', u?.members ?? '', w.claimedAt ? shortAddress(w.owner) : `${shortAddress(w.owner)} (unclaimed)`, backup ? day(backup.at) : 'never'];
  });
  print(table(['NAME', 'STATE', 'PLAN', 'IMAGE', 'CREATED', 'SUSPENDED', 'DISK', 'MEMBERS', 'OWNER', 'BACKUP'], rows));
  print(`\n${workspaces.length} workspaces.`);
  return 0;
}
