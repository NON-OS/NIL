import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';
import dropBlobs from './dropBlobs.js';
import unusedDocBlobs from './unusedDocBlobs.js';

// a chunk that arrived under its own name and was never moved into place
const INCOMING = /^[\w-]+_\d+\.[\w-]+\.in$/;

// Throws away sealed blobs nobody will finish or use: uploads untouched for
// SEALED_UPLOAD_IDLE_MINUTES, finished files a folder never took in within
// SEALED_UPLOAD_STALE_MINUTES (the browser stopped between the upload and adding the file, or
// between encrypting a file again and swapping it in), anything whose doc or folder is gone, and
// pictures and files taken out of a doc that none of its kept versions uses (see unusedDocBlobs).
export default async function sweepBlobs({ now = Date.now() } = {}) {
  const cutoff = now - config.sealedBlobs.staleMs;
  const ids = [
    ...sql.all('SELECT id FROM sealed_blobs WHERE finished_at IS NULL AND updated_at < ?', now - config.sealedBlobs.idleMs),
    ...sql.all(
      `SELECT b.id FROM sealed_blobs b WHERE b.scope_kind = 'folder' AND b.finished_at IS NOT NULL AND b.updated_at < ?
         AND NOT EXISTS (SELECT 1 FROM folder_items i WHERE i.blob_id = b.id) AND NOT EXISTS (SELECT 1 FROM folder_items i WHERE i.thumb_id = b.id)
         AND NOT EXISTS (SELECT 1 FROM folder_items i WHERE i.hashes_id = b.id)`,
      cutoff,
    ),
    ...sql.all(
      `SELECT b.id FROM sealed_blobs b WHERE (b.scope_kind = 'doc' AND NOT EXISTS (SELECT 1 FROM docs d WHERE d.id = b.scope_id))
         OR (b.scope_kind = 'folder' AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = b.scope_id))`,
    ),
  ].map((r) => r.id);
  ids.push(...unusedDocBlobs(now));
  const dropped = await dropBlobs(ids);
  for (const name of fs.readdirSync(uploadDir)) {
    if (!INCOMING.test(name)) continue;
    const file = path.join(uploadDir, name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat && now - stat.mtimeMs > config.sealedBlobs.staleMs) fs.rmSync(file, { force: true });
  }
  return dropped;
}
