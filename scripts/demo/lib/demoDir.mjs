import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Where a demo keeps its server data, wallets, sign-ins, generated files and screenshots. It is
// never inside the repository, since the wallets and sign-ins only make sense on this machine.
const dir = path.resolve(process.env.NIL_DEMO_DIR || path.join(os.tmpdir(), 'nil-demo'));
fs.mkdirSync(dir, { recursive: true });

export default dir;
