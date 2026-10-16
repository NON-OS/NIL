import fs from 'node:fs';

// The id `npm run build` stamps on the web app, so an open tab can tell a newer one has been
// deployed. Read again only when the file changes, which also covers a rebuild without a
// restart. Null without a build, as in development.
const FILE = new URL('../../dist/build.json', import.meta.url);
let cached = { mtime: -1, id: null };

export default function buildId() {
  let mtime;
  try {
    mtime = fs.statSync(FILE).mtimeMs;
  } catch {
    return null;
  }
  if (mtime !== cached.mtime) {
    let id = null;
    try {
      id = JSON.parse(fs.readFileSync(FILE, 'utf8')).id ?? null;
    } catch {}
    cached = { mtime, id: typeof id === 'string' ? id : null };
  }
  return cached.id;
}
