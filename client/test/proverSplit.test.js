import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The app is BUSL and the prover is GPL, so they stay two programs: the app never imports the
// GPL proving stack or the prover's own code, and the prover never imports the app's. The only
// line between them is the Worker the app starts and the messages it sends.
const ROOT = new URL('../..', import.meta.url).pathname;
// the GPL packages, and @semaphore-protocol/proof, which brings snarkjs with it
const GPL = ['snarkjs', 'ffjavascript', 'wasmcurves', 'wasmbuilder', 'fastfile', 'r1csfile', 'circomlibjs', '@iden3/', '@semaphore-protocol/proof'];
const IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;

const sources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(js|mjs|ts|tsx)$/.test(entry.name) ? [file] : [];
  });

const imports = (file) => [...fs.readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => ({ file: path.relative(ROOT, file), spec: m[1] }));
const isGpl = (spec) => GPL.some((name) => spec === name || spec.startsWith(name.endsWith('/') ? name : `${name}/`));
const reaches = (from, spec, dir) => spec.startsWith('.') && path.resolve(path.dirname(path.join(ROOT, from)), spec).startsWith(path.join(ROOT, dir));

test('the app imports none of the GPL proving stack', () => {
  const found = sources(path.join(ROOT, 'client/src')).flatMap(imports).filter((i) => isGpl(i.spec));
  assert.deepEqual(found, []);
});

test('the app reaches the prover only by its address, never by importing it', () => {
  const found = sources(path.join(ROOT, 'client/src')).flatMap(imports).filter((i) => reaches(i.file, i.spec, 'prover'));
  assert.deepEqual(found, []);
});

test('the prover imports nothing from the app', () => {
  const found = sources(path.join(ROOT, 'prover/src')).flatMap(imports).filter((i) => i.spec.startsWith('.') && !reaches(i.file, i.spec, 'prover'));
  assert.deepEqual(found, []);
});
