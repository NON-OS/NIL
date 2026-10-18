// Checks that a running Nil server sends browsers exactly the web app of a release: every file
// byte for byte, the routes people open the app on, and a Content-Security-Policy that can't
// pull scripts in from anywhere else. Exits 0 when all of it matches, 1 when anything doesn't.
//   npm ci && npm run build && npm run verify:server -- https://nil.example
//       compares the server with the build you just made from this source
//   npm run verify:server -- https://nil.example --manifest release/web-3.0.0.json
//       compares it with a published manifest instead
//   --user-agent "..."   the browser the check presents itself as
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import buildManifest from './buildManifest.mjs';
import verifyServer from './verifyServer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// as ordinary a desktop browser as there is, so a server can't pick the check out by this alone
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const base = args.find((arg) => /^https?:\/\//.test(arg));
if (!base) fail('Give the server to check: npm run verify:server -- https://nil.example');

function release() {
  const file = option('--manifest');
  if (file) {
    const text = fs.readFileSync(path.resolve(file), 'utf8');
    const manifest = JSON.parse(text);
    return { version: manifest.version, hash: createHash('sha256').update(text).digest('hex'), files: Object.entries(manifest.files) };
  }
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) fail('No build to compare with. Run npm ci and npm run build first, or pass --manifest.');
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return { version, ...buildManifest(dist, version) };
}

const { version, hash, files } = release();
console.log(`Nil ${version}, release hash ${hash}`);
console.log(`Checking ${base}`);
const report = await verifyServer({ base, files, userAgent: option('--user-agent') ?? BROWSER });
if (report.problems.length === 0) {
  console.log(`All match: ${report.files} files and ${report.routes} routes, byte for byte, and the Content-Security-Policy is Nil's own.`);
} else {
  console.log(`${report.problems.length} ${report.problems.length === 1 ? 'difference' : 'differences'}:`);
  for (const problem of report.problems) console.log(`  ${problem}`);
  process.exit(1);
}
