import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import backupFormat from '../backupFormat.js';

// The operator creates this file on the mounted share. If the mount ever drops, the directory
// underneath is empty, and backups stop with an alert instead of filling the server's own disk.
const MARKER = '.nil-backup-target';

// Backups in a directory: a mounted Hetzner Storage Box (CIFS or SSHFS), an NFS share or a
// second disk. Files are written under a temporary name and renamed once complete and synced.
export default function fileTarget({ dir }) {
  const resolve = (key) => {
    const file = path.resolve(dir, key);
    if (!file.startsWith(`${dir}${path.sep}`)) throw new Error('Backup path escapes the backup directory.');
    return file;
  };

  const target = {
    describe: () => `file://${dir}`,

    async check() {
      if (!fs.existsSync(path.join(dir, MARKER))) throw new Error(`${dir}/${MARKER} is missing. Is the backup share mounted? Create the file once the share is mounted.`);
    },

    async put(key, readable) {
      await target.check();
      const file = resolve(key);
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const partial = `${file}.partial`;
      try {
        await pipeline(readable, fs.createWriteStream(partial, { mode: 0o600 }));
        const fd = fs.openSync(partial, 'r');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(partial, file);
      } catch (err) {
        fs.rmSync(partial, { force: true });
        throw err;
      }
      return { location: file, bytes: fs.statSync(file).size };
    },

    // `location` is what put() returned, or a key relative to the backup directory
    async get(location) {
      const file = resolve(path.isAbsolute(location) ? path.relative(dir, location) : location);
      if (!fs.existsSync(file)) throw new Error(`${location} isn’t in the backup directory.`);
      return fs.createReadStream(file);
    },

    // Removes backups older than `before`, but in folders listed in `keepNewest` (workspaces
    // that still exist) the newest file always stays, so a run of failed backups can't age the
    // last good one away. A deleted workspace's final backup expires like any other.
    async prune({ before, keepNewest }) {
      await target.check();
      let removed = 0;
      for (const group of ['workspaces', 'control']) {
        const root = path.join(dir, group);
        if (!fs.existsSync(root)) continue;
        const folders = group === 'control' ? [root] : fs.readdirSync(root).map((id) => path.join(root, id));
        for (const folder of folders) {
          if (!fs.statSync(folder).isDirectory()) continue;
          const files = fs
            .readdirSync(folder)
            .filter((f) => f.endsWith(backupFormat.extension))
            .map((f) => ({ file: path.join(folder, f), mtime: fs.statSync(path.join(folder, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          const protect = group === 'control' || keepNewest.has(path.basename(folder));
          for (const [i, { file, mtime }] of files.entries()) {
            if (mtime < before && !(protect && i === 0)) {
              fs.rmSync(file, { force: true });
              removed++;
            }
          }
          if (group === 'workspaces' && !fs.readdirSync(folder).length) fs.rmdirSync(folder);
        }
      }
      return { removed };
    },
  };
  return target;
}
