import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const SCRATCH = /^(capsule|restore)-/;

// A capsule export or restore works in a folder of its own in DATA_DIR, and that folder holds a
// plaintext copy of the database. A crash or a power cut halfway leaves it behind, so the server
// clears whatever is left when it starts, before any export or restore can be under way.
export default function clearScratch() {
  for (const entry of fs.readdirSync(config.dataDir, { withFileTypes: true })) {
    if (entry.isDirectory() && SCRATCH.test(entry.name)) fs.rmSync(path.join(config.dataDir, entry.name), { recursive: true, force: true });
  }
}
