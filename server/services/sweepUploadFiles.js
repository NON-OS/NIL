import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import uploadDir from '../lib/uploadDir.js';

// What each stored file's name says it belongs to: a chunk of a sealed blob, an encrypted chat
// file, or a task attachment. Staged copies and uploads still arriving have names of their own
// and are cleared elsewhere.
const KINDS = [
  { name: /^([\w-]+)_\d+$/, owned: (id) => sql.get('SELECT 1 FROM sealed_blobs WHERE id = ?', id) },
  { name: /^chat-([\w-]+)$/, owned: (id) => sql.get('SELECT 1 FROM chat_files WHERE id = ?', id) },
  { name: /^([\w-]{12})$/, owned: (id) => sql.get('SELECT 1 FROM attachments WHERE id = ?', id) },
];

// Deletes stored files no row points at once they're older than `olderThan` ms: left behind by a
// rollback that restored an older database, a delete whose file removal failed, or an upload that
// finished after what it was for was gone. Reads the folder a few entries at a time, so a big
// one doesn't hold up the server.
export default async function sweepUploadFiles({ olderThan, now = Date.now() }) {
  let removed = 0;
  const dir = await fs.promises.opendir(uploadDir);
  for await (const entry of dir) {
    if (!entry.isFile()) continue;
    const kind = KINDS.find((k) => k.name.test(entry.name));
    if (!kind || kind.owned(kind.name.exec(entry.name)[1])) continue;
    const file = path.join(uploadDir, entry.name);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat || now - stat.mtimeMs < olderThan) continue;
    await fs.promises.rm(file, { force: true });
    removed++;
  }
  return removed;
}
