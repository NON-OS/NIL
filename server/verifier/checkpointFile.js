import fs from 'node:fs';
import path from 'node:path';

const ROOT = /^0x[0-9a-f]{64}$/;
const NAME = 'checkpoint';

// The newest finalized checkpoint the light client has followed to, kept on disk so a restart
// starts from it instead of from VERIFIER_CHECKPOINT, which only gets older. It holds nothing
// but that one block root.
const checkpointFile = {
  read(dir) {
    try {
      const value = fs.readFileSync(path.join(dir, NAME), 'utf8').trim().toLowerCase();
      return ROOT.test(value) ? value : null;
    } catch {
      return null;
    }
  },

  write(dir, checkpoint) {
    if (!ROOT.test(String(checkpoint))) return;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, `${NAME}.tmp`);
    fs.writeFileSync(tmp, `${checkpoint}\n`, { mode: 0o600 });
    fs.renameSync(tmp, path.join(dir, NAME));
  },
};

export default checkpointFile;
