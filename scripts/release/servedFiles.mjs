import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Every file in a web build, as the path a browser asks for and the SHA-256 of its bytes, sorted
// by path. The server hands out each file in dist under its own name, so this is everything a
// browser can ever be sent.
export default function servedFiles(dist) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push([`/${path.relative(dist, full).split(path.sep).join('/')}`, createHash('sha256').update(fs.readFileSync(full)).digest('hex')]);
    }
  };
  walk(dist);
  // compared by code unit, not locale, so every machine sorts the same way
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
