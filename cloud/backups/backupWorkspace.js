import { Readable, pipeline } from 'node:stream';
import sealStream from './sealStream.js';
import backupKey from './backupKey.js';
import dataLayout from '../runtime/dataLayout.js';
import tarEntry from '../lib/tar/tarEntry.js';

// One encrypted backup of a workspace's data directory. The plaintext exists only as a stream
// between the workspace and the cipher; what reaches the target is ciphertext. The archive
// starts with a small manifest (the control plane's own record of the workspace) so a backup
// can be restored on a server whose control database was lost.
export default async function backupWorkspace(ctx, workspace, kind = 'scheduled') {
  const takenAt = ctx.store.now();
  const manifest = {
    format: 1,
    id: workspace.id,
    name: workspace.name,
    owner: workspace.owner,
    plan: workspace.plan,
    image: workspace.image,
    createdAt: new Date(workspace.createdAt).toISOString(),
    takenAt: new Date(takenAt).toISOString(),
    kind,
  };
  const data = await ctx.driver.exportData(workspace.id);
  const plain = Readable.from(
    (async function* () {
      yield tarEntry({ name: dataLayout.manifest, data: Buffer.from(JSON.stringify(manifest)) });
      yield* data;
    })(),
  );
  const sealed = sealStream(ctx.config.backup.recipients);
  pipeline(plain, sealed, () => {});
  const result = await ctx.backupTarget.put(backupKey(workspace.id, kind, takenAt), sealed);
  ctx.store.backups.add({ workspaceId: workspace.id, kind, location: result.location, bytes: result.bytes });
  ctx.store.events.add(workspace.id, 'backup', kind);
  ctx.log.info('backup.done', { workspace: workspace.id, kind, bytes: result.bytes });
  return result;
}
