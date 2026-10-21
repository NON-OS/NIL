// Checks a web build keeps the prover apart: snarkjs, ffjavascript and the rest of the iden3
// stack are GPL code, and they may only be in dist/prover, the separate program the app talks to
// by messages. Any of their code in an app chunk fails the build.
//   npm run build     runs this after both builds
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PROVER = path.join(DIST, 'prover');

// Strings that survive minifying, at least one from each GPL package the prover bundles:
// snarkjs, ffjavascript, wasmcurves, fastfile and @iden3/binfileutils. None of them is a word
// the app would use on its own.
const MARKERS = [
  'fullProve',
  'zkey file is not groth16',
  'getCurveFromName',
  'lagrangeEvaluations input too big',
  'g1m_batchApplyKey',
  'offsetWitness',
  'Invalid FastFile type',
  'Invalid section size reading',
];

const scripts = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return scripts(file);
    return /\.(js|mjs)$/.test(entry.name) ? [file] : [];
  });

const found = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return MARKERS.filter((marker) => text.includes(marker));
};

if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(PROVER)) {
  console.error('No complete build to check. Run npm run build first.');
  process.exit(1);
}

const leaks = scripts(DIST)
  .filter((file) => !file.startsWith(PROVER + path.sep))
  .map((file) => ({ file: path.relative(ROOT, file), markers: found(file) }))
  .filter((leak) => leak.markers.length > 0);
for (const leak of leaks) console.error(`${leak.file} has prover code in it: ${leak.markers.join(', ')}`);

// The markers have to match what the prover really contains, or the check above proves nothing.
const inProver = new Set(scripts(PROVER).flatMap(found));
const stale = MARKERS.filter((marker) => !inProver.has(marker));
if (stale.length > 0) console.error(`The prover build no longer contains ${stale.join(', ')}. Pick markers from its current code.`);

if (leaks.length > 0 || stale.length > 0) process.exit(1);
console.log(`Prover split holds: no GPL prover code in the app's ${scripts(DIST).length - scripts(PROVER).length} scripts.`);
