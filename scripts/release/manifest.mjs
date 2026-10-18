// Prints the release hash of a web build and, with --out, writes its release manifest.
//   npm run build && npm run release:manifest
//   npm run release:manifest -- --out release/web-3.0.0.json
//   npm run release:manifest -- --dist image-dist     a build copied out of the Docker image
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import buildManifest from './buildManifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const dist = path.resolve(option('--dist') ?? path.join(ROOT, 'dist'));
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`No web build in ${dist}. Run npm ci and npm run build first.`);
  process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = buildManifest(dist, version);
const out = option('--out');
if (out) fs.writeFileSync(path.resolve(out), manifest.text);
console.log(`Nil ${version}: ${manifest.files.length} files${out ? `, manifest written to ${out}` : ''}`);
console.log(`Release hash: ${manifest.hash}`);
