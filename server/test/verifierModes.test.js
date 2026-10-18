import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEY = 'k'.repeat(64);

// Reads the verification settings in a fresh process, since they are fixed at import.
function settings(env, module = './server/config/verification.js', show = '({ mode: c.mode, required: c.required, shadow: c.shadow })') {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `const { default: c } = await import('${module}'); console.log(JSON.stringify(${show}))`], { cwd: ROOT, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr, value: run.status === 0 ? JSON.parse(run.stdout.trim().split('\n').at(-1)) : null };
}

test('off is the default, even with a key: the node is believed, as it always was', () => {
  assert.deepEqual(settings({}).value, { mode: 'off', required: false, shadow: false });
  assert.deepEqual(settings({ NOX_VERIFIER_KEY: KEY }).value, { mode: 'off', required: false, shadow: false });
  const typo = settings({ NOX_VERIFIER_MODE: 'enforced', NOX_VERIFIER_KEY: KEY });
  assert.equal(typo.value.mode, 'off');
  assert.match(typo.stderr, /isn’t off, shadow or enforce/);
});

test('shadow needs a key and the verifier’s address; without them it says so and is off, and the server still starts', () => {
  assert.deepEqual(settings({ NOX_VERIFIER_MODE: 'shadow', NOX_VERIFIER_KEY: KEY, NOX_VERIFIER_URL: 'http://verifier:8545' }).value, { mode: 'shadow', required: false, shadow: true });
  const keyless = settings({ NOX_VERIFIER_MODE: 'shadow', NOX_VERIFIER_URL: 'http://verifier:8545' });
  assert.equal(keyless.value.mode, 'off');
  assert.match(keyless.stderr, /without the key chain reads aren’t checked/);
  // a missing verifier is no reason to stop a server, STRICT_CONFIG or not
  const strict = settings({ NOX_VERIFIER_MODE: 'shadow', STRICT_CONFIG: '1', APP_URL: 'http://localhost:3000', NOX_RPC_URL: 'off' }, './server/config.js', 'c.verification.mode');
  assert.equal(strict.status, 0, strict.stderr);
  assert.equal(strict.value, 'off');
});

test('enforce refuses to start without the key', () => {
  assert.equal(settings({ NOX_VERIFIER_MODE: 'enforce' }).status, 1);
  assert.deepEqual(settings({ NOX_VERIFIER_MODE: 'enforce', NOX_VERIFIER_KEY: KEY }).value, { mode: 'enforce', required: true, shadow: false });
  assert.equal(settings({ NOX_VERIFIER_MODE: 'enforce', NOX_VERIFIER_KEY: 'short' }).status, 1);
});
