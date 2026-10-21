import findWorkspace from '../findWorkspace.js';
import formatBytes from '../../lib/formatBytes.js';

const when = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) : '');

export default async function info(ctx, { args, print }) {
  const w = findWorkspace(ctx, args[0]);
  const usage = ctx.store.usage.all().get(w.id);
  const status = await ctx.driver.status(w.id).catch(() => null);
  const lines = [
    ['Address', `https://${w.name}.${ctx.config.domain}`],
    ['Id', w.id],
    ['State', `${w.state}${w.suspendReason ? ` (${w.suspendReason})` : ''}`],
    ['Container', status ? `${status.exists ? (status.running ? 'running' : 'stopped') : 'missing'}, health ${status.health}` : 'unknown'],
    ['App reports', status?.report?.version ? `version ${status.report.version}, schema ${status.report.schema ?? '?'}` : 'nothing yet'],
    ['Owner', w.owner ?? ''],
    ['Claimed', w.claimedAt ? when(w.claimedAt) : 'not yet'],
    ['Image', w.image],
    ['Plan', w.plan],
    ['Official', w.official ? 'yes: may start votes for every NOX holder' : 'no'],
    ['Volume', w.volume],
    ['Disk', usage ? formatBytes(usage.diskBytes) : ''],
    ['Members', usage?.members ?? 'not reported'],
    ['Created', when(w.createdAt)],
    ['Suspended', when(w.suspendedAt)],
    ['Deletion after', when(w.deleteAfter)],
    ['Checkpoint', w.checkpointImage ? `${w.checkpointImage}, taken ${when(w.checkpointAt)}` : 'none'],
    ['Last healthy', when(w.lastHealthyAt)],
  ];
  print(lines.map(([k, v]) => `${k.padEnd(15)} ${v}`).join('\n'));
  const backups = ctx.store.backups.list(w.id, 5);
  print(`\nBackups:\n${backups.map((b) => `  ${when(b.at)}  ${b.kind.padEnd(9)} ${formatBytes(b.bytes).padStart(7)}  ${b.location}`).join('\n') || '  none'}`);
  const events = ctx.store.events.recent(w.id, 15);
  print(`\nHistory:\n${events.map((e) => `  ${when(e.at)}  ${e.kind}${e.detail ? `  ${e.detail}` : ''}`).join('\n')}`);
  return 0;
}
