import config from '../config.js';
import storedBytes from '../services/storedBytes.js';
import storageFull from '../services/storageFull.js';

const WRITES = new Set(['POST', 'PUT', 'PATCH']);
// paying for more room, changing who's in the workspace and clearing notifications stay open
// when it's full, so an admin can always get out of it
const ALWAYS = ['/plan', '/users', '/notifications', '/me'];

// Refuses new writes once the workspace's files and database fill UPLOAD_QUOTA_MB. Reading,
// deleting and exporting keep working, so the way out is always there.
export default function storageGuard(req, res, next) {
  const quota = config.uploads.workspaceQuotaBytes;
  if (!quota || !WRITES.has(req.method) || ALWAYS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();
  if (storedBytes().total < quota || storedBytes({ fresh: true }).total < quota) return next();
  res.status(413).json({ error: storageFull(quota) });
}
