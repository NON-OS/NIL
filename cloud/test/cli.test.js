import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import main from '../cli/main.js';
import backupKeys from '../backups/backupKeys.js';
import sealStream from '../backups/sealStream.js';
import tarEntry from '../lib/tar/tarEntry.js';
import tarBlocks from '../lib/tar/tarBlocks.js';
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

test('a backup can be verified and decrypted on a laptop, with no server configuration', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-laptop-'));
  const keyFile = path.join(dir, 'backup.key');
  const out = await run(['keygen', '--out', keyFile], {});
  const publicKey = out.out.match(/nilbk-pub-\S+/)[0];
  const tar = Buffer.concat([tarEntry({ name: '.nil-cloud.json', data: Buffer.from(JSON.stringify({ name: 'acme', id: 'abc', kind: 'scheduled', takenAt: 'now', image: 'nonos/nil:1' })) }), tarEntry({ name: 'nonos.db', data: Buffer.from('database') }), tarEntry({ name: 'uploads/f', data: Buffer.alloc(3000, 1) }), tarBlocks.end()]);
  const backupFile = path.join(dir, 'acme.nilbackup');
  await pipeline(Readable.from([tar]), sealStream([backupKeys.parsePublic(publicKey)]), fs.createWriteStream(backupFile));

  const verified = await run(['verify-backup', backupFile, '--identity', keyFile], {});
  assert.equal(verified.code, 0);
  assert.match(verified.out, /Workspace acme \(abc\)/);
  assert.match(verified.out, /Intact: 2 files, .*database included/);

  const plain = path.join(dir, 'plain.tar');
  assert.equal((await run(['decrypt', backupFile, '--identity', keyFile, '--out', plain], {})).code, 0);
  assert.deepEqual(fs.readFileSync(plain), tar);
  assert.equal(fs.statSync(plain).mode & 0o777, 0o600);
  assert.equal((await run(['decrypt', backupFile, '--identity', keyFile, '--out', plain], {})).code, 1, 'never overwrites');

  const other = path.join(dir, 'other.key');
  await run(['keygen', '--out', other], {});
  assert.equal((await run(['verify-backup', backupFile, '--identity', other], {})).code, 1, 'the wrong key is refused');
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
