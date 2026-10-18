import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import uploadDir from '../lib/uploadDir.js';
import stagedFile from '../lib/stagedFile.js';

const STAGED = /^([\w-]+)\.(sealed|plain)$/;
const PART = /\.part$/;

// Staged copies left lying around. One that already matches its file's row was swapped in by a
// change that committed just before the server stopped, so its rename is finished here. Any
// other belongs to an attempt that was given up, and goes once it's older than `olderThan`, so
// a seal still under way keeps its copies. Copies from a given-up open-up are plain bytes of an
// encrypted file, which is why this also runs while the server is up, not only at start. A
// .part file is an upload cut off by a stop or crash.
export default function settleStaged({ olderThan = 0 } = {}) {
  // an upload can finish, and its .part file go, between listing the folder and looking at it
  const abandoned = (file) => {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    return Boolean(stat) && (!olderThan || Date.now() - stat.mtimeMs > olderThan);
  };
  for (const name of fs.readdirSync(uploadDir)) {
    if (PART.test(name)) {
      const part = path.join(uploadDir, name);
      if (abandoned(part)) fs.rmSync(part, { force: true });
      continue;
    }
    const [, id, kind] = STAGED.exec(name) ?? [];
    if (!id) continue;
    const sealed = kind === 'sealed';
    const row = sql.get('SELECT sealed FROM attachments WHERE id = ?', id);
    const file = stagedFile.path(id, sealed);
    if (row && Boolean(row.sealed) === sealed) stagedFile.commit(id, sealed);
    else if (abandoned(file)) fs.rmSync(file, { force: true });
  }
}
