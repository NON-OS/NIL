import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import sealStream from './sealStream.js';
import backupKey from './backupKey.js';

// An encrypted copy of the control database: which workspaces exist, their owners and plans.
// Without it a full restore still works from the workspace backups' manifests, but this keeps
// the history and settings too.
export default async function backupControl(ctx) {
  const copy = path.join(ctx.config.dataDir, `control-backup-${process.pid}.db`);
  fs.rmSync(copy, { force: true });
  try {
    ctx.store.db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
    const sealed = sealStream(ctx.config.backup.recipients);
    pipeline(fs.createReadStream(copy), sealed, () => {});
    const result = await ctx.backupTarget.put(backupKey(null, 'control', ctx.store.now()), sealed);
    ctx.store.backups.add({ workspaceId: null, kind: 'control', location: result.location, bytes: result.bytes });
    return result;
  } finally {
    fs.rmSync(copy, { force: true });
  }
}
