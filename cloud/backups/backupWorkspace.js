import { Readable, pipeline } from 'node:stream';
import sealStream from './sealStream.js';
import backupKey from './backupKey.js';
import dataLayout from '../runtime/dataLayout.js';
import tarEntry from '../lib/tar/tarEntry.js';
import withLock from '../provisioning/withLock.js';

// states whose data stays put while it is read; "deleting" is the final export before deletion
const STEADY = ['active', 'stopped', 'suspended', 'failed', 'deleting'];

// One encrypted backup of a workspace's data directory. The plaintext exists only as a stream
// between the workspace and the cipher; what reaches the target is ciphertext. The archive
// starts with a small manifest (the control plane's own record of the workspace) so a backup
// can be restored on a server whose control database was lost. It holds the workspace's lock
// until the backup is stored, so an upgrade or rollback can't change the volume mid-read.
export default function backupWorkspace(ctx, workspace, kind = 'scheduled') {
  return withLock(ctx, workspace.id, 'backup', async () => {
    // read again under the lock: the workspace may have moved on since the caller looked
    const current = ctx.store.workspaces.get(workspace.id);
    if (!current || !STEADY.includes(current.state)) throw new Error(`It is ${current?.state ?? 'gone'}, so it wasn’t backed up this time.`);
    const takenAt = ctx.store.now();
    const manifest = {
      format: 1,
      id: current.id,
      name: current.name,
      owner: current.owner,
      plan: current.plan,
      image: current.image,
      createdAt: new Date(current.createdAt).toISOString(),
      takenAt: new Date(takenAt).toISOString(),
      kind,
    };
    const data = await ctx.driver.exportData(current.id);
    const plain = Readable.from(
      (async function* () {
        yield tarEntry({ name: dataLayout.manifest, data: Buffer.from(JSON.stringify(manifest)) });
        yield* data;
      })(),
    );
    const sealed = sealStream(ctx.config.backup.recipients);
    pipeline(plain, sealed, () => {});
    const result = await ctx.backupTarget.put(backupKey(current.id, kind, takenAt), sealed);
    ctx.store.backups.add({ workspaceId: current.id, kind, location: result.location, bytes: result.bytes });
    ctx.store.events.add(current.id, 'backup', kind);
    ctx.log.info('backup.done', { workspace: current.id, kind, bytes: result.bytes });
    return result;
  });
}
