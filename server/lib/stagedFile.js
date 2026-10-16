import fs from 'node:fs';
import path from 'node:path';
import uploadDir from './uploadDir.js';

// A replacement for a stored file, uploaded ahead of the task change that swaps it in: an
// encrypted copy before a task is sealed, a plain one before it's opened up again. It sits
// next to the file under a suffix naming which it is, so the swap is a rename on the same
// disk, and capsules, which only take bare ids from the upload folder, leave it out.
const stagedFile = {
  path: (id, sealed) => path.join(uploadDir, `${id}.${sealed ? 'sealed' : 'plain'}`),

  commit(id, sealed) {
    fs.renameSync(stagedFile.path(id, sealed), path.join(uploadDir, id));
  },

  discard(id) {
    for (const sealed of [true, false]) fs.rmSync(stagedFile.path(id, sealed), { force: true });
  },
};

export default stagedFile;
