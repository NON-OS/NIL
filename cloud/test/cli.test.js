import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import main from '../cli/main.js';
import backupKeys from '../backups/backupKeys.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import createContext from '../createContext.js';
import loadConfig from '../config/loadConfig.js';
import baseEnv from './helpers/baseEnv.js';

function run(argv, env) {
  const lines = [];
  return main(argv, { print: (line) => lines.push(line), env }).then((code) => ({ code, out: lines.join('\n') }));
}

test('keygen writes the secret key to a private file and prints only the public key', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nil-keys-')), 'backup.key');
  const { code, out } = await run(['keygen', '--out', file], {});
  assert.equal(code, 0);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const secret = backupKeys.parseSecret(fs.readFileSync(file, 'utf8'));
  assert.ok(secret);
  assert.match(out, /nilbk-pub-/);
  assert.doesNotMatch(out, /nilbk-sec-/, 'the secret never goes to the terminal');
  assert.equal((await run(['keygen', '--out', file], {})).code, 1, 'an existing key file is never overwritten');
});

test('list shows workspaces without their setup tokens, in text and JSON', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-cli-'));
  const env = { ...baseEnv, CLOUD_DATA_DIR: dataDir };
  const ctx = createContext(loadConfig(env).config, { log: { info() {}, warn() {}, error() {} }, walletTag: () => 'w' });
  const ws = createWorkspace(ctx, { name: 'acme', owner: `0x${'e'.repeat(40)}` });
  ctx.store.db.close();

  const text = await run(['list'], env);
  assert.equal(text.code, 0);
  assert.match(text.out, /NAME\s+STATE\s+PLAN/);
  assert.match(text.out, /acme\s+provisioning\s+standard\s+nonos\/nil:1\.0\.0/);
  assert.match(text.out, /0xeeee…eeee \(unclaimed\)/);
  const json = await run(['list', '--json'], env);
  assert.doesNotMatch(json.out, new RegExp(ws.setupToken));
  assert.equal(JSON.parse(json.out)[0].name, 'acme');

  assert.equal((await run(['info', 'nope'], env)).code, 1);
  assert.equal((await run(['bogus'], env)).code, 2);
  assert.equal((await run(['delete', 'acme', '--yes', '--now', '--unknown-flag'], env)).code, 2);
});
