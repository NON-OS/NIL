// Builds the Lean proofs in formal/, checks them, and writes the test vectors the JavaScript
// tests read. Fails if a proof is missing, a Lean file declares an axiom or uses sorry, admit or
// native_decide, or a main theorem rests on more than propext, Quot.sound and Classical.choice.
// Usage: npm run formal   (needs elan; see docs/formal-verification.md)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FORMAL = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'formal');
const ELAN_BIN = path.join(os.homedir(), '.elan', 'bin');
const env = { ...process.env, PATH: `${ELAN_BIN}${path.delimiter}${process.env.PATH}` };
const lake = (...args) => execFileSync('lake', args, { cwd: FORMAL, env, stdio: 'inherit' });

function leanFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.lake') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) leanFiles(full, out);
    else if (entry.name.endsWith('.lean')) out.push(full);
  }
  return out;
}

// comments and strings may name these words; only code counts
const FORBIDDEN = /\b(sorry|admit|native_decide)\b|^\s*axiom\s/m;
const problems = leanFiles(FORMAL).filter((file) => {
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/\/-[\s\S]*?-\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return FORBIDDEN.test(code);
});
if (problems.length) {
  console.error(`sorry, admit, native_decide or an axiom in:\n  ${problems.map((f) => path.relative(FORMAL, f)).join('\n  ')}`);
  process.exit(1);
}

lake('build');
// prints what every main theorem rests on, and fails on anything beyond the three allowed
lake('env', 'lean', 'Axioms.lean');
lake('exe', 'vectors', 'vectors');
