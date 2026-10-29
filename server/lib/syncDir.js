import fs from 'node:fs';

// Makes a rename in `dir` survive a power cut: the directory's own entry is written to the disk.
// Some systems can't open a directory for this; there the rename stands as the system keeps it.
export default function syncDir(dir) {
  let fd = null;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch {
    // nothing more can be done here
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}
