import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import rewriteTar from '../lib/tar/rewriteTar.js';
import tarEntry from '../lib/tar/tarEntry.js';
import tarBlocks from '../lib/tar/tarBlocks.js';
import dataLayout from '../runtime/dataLayout.js';
import collect from './helpers/collect.js';
import readTar from './helpers/readTar.js';

const archive = (...entries) => Buffer.concat([...entries.map((e) => tarEntry(e)), tarBlocks.end()]);
const rewrite = async (buffer, options) => collect(Readable.from([buffer]).pipe(rewriteTar(options)));
const names = (buffer) => readTar(buffer).map((e) => `${e.type === 'dir' ? 'd' : 'f'} ${e.name}${e.type === 'file' ? `=${e.data}` : ''}`);
const hasTar = spawnSync('tar', ['--version']).status === 0;

test('a live export swaps the database files for the VACUUM INTO snapshot and drops scratch', async () => {
  const input = archive(
    { name: 'data', type: 'dir' },
    { name: 'data/nonos.db', data: Buffer.from('live') },
    { name: 'data/nonos.db-wal', data: Buffer.from('wal') },
    { name: 'data/nonos.db-shm', data: Buffer.from('shm') },
    { name: 'data/.nil-snapshot', type: 'dir' },
    { name: 'data/.nil-snapshot/nonos.db', data: Buffer.from('snapshot') },
    { name: 'data/.nil-checkpoint/nonos.db', data: Buffer.from('old') },
    { name: 'data/capsule-x1/nonos.db', data: Buffer.from('scratch') },
    { name: 'data/keys', type: 'dir' },
    { name: 'data/keys/receipts-ed25519.pem', data: Buffer.from('key') },
    { name: 'data/uploads/f1', data: Buffer.from('file') },
  );
  assert.deepEqual(names(await rewrite(input, { decide: dataLayout.exportDecide(true) })), ['f nonos.db=snapshot', 'd keys', 'f keys/receipts-ed25519.pem=key', 'f uploads/f1=file']);
  // stopped: the files on disk are consistent, so the database and its WAL go as they are
  assert.deepEqual(names(await rewrite(input, { decide: dataLayout.exportDecide(false) })), ['f nonos.db=live', 'f nonos.db-wal=wal', 'd keys', 'f keys/receipts-ed25519.pem=key', 'f uploads/f1=file']);
});

test('restores accept only plain files and folders inside the data folder', async () => {
  const ok = archive({ name: '.nil-cloud.json', data: Buffer.from('{}') }, { name: 'nonos.db', data: Buffer.from('db') }, { name: 'uploads/a', data: Buffer.from('a') }, { name: 'nonos.db-shm', data: Buffer.from('x') });
  assert.deepEqual(names(await rewrite(ok, { decide: dataLayout.restoreDecide })), ['f nonos.db=db', 'f uploads/a=a']);
  for (const name of ['/etc/passwd', 'uploads/../../escape', 'a\\b']) {
    await assert.rejects(rewrite(archive({ name, data: Buffer.from('x') }), { decide: dataLayout.restoreDecide }), /Unsafe path/, name);
  }
  const link = tarEntry({ name: 'uploads/link' });
  link[156] = '2'.charCodeAt(0);
  tarBlocks.sign(link);
  await assert.rejects(rewrite(Buffer.concat([link, tarBlocks.end()]), { decide: dataLayout.restoreDecide }), /only hold files and folders/);
});

test('checkpoint and rollback map the database files in and out of the checkpoint folder', async () => {
  const db = archive({ name: 'nonos.db', data: Buffer.from('v1') });
  assert.deepEqual(names(await rewrite(db, { decide: dataLayout.checkpointDecide })), ['f .nil-checkpoint/nonos.db=v1']);
  const saved = archive({ name: '.nil-checkpoint', type: 'dir' }, { name: '.nil-checkpoint/nonos.db', data: Buffer.from('v1') }, { name: '.nil-checkpoint/nonos.db-wal', data: Buffer.alloc(0) });
  assert.deepEqual(names(await rewrite(saved, { decide: dataLayout.rollbackDecide })), ['f nonos.db=v1', 'f nonos.db-wal=']);
});

test('archives can be joined: end blocks left off, extra entries appended', async () => {
  const part = await rewrite(archive({ name: 'a', data: Buffer.from('1') }), { decide: (e) => e.name, end: false, append: () => [tarEntry({ name: 'b', data: Buffer.from('2') })] });
  assert.equal(part.length, 2048);
  assert.deepEqual(names(Buffer.concat([part, tarBlocks.end()])), ['f a=1', 'f b=2']);
});

test('a truncated archive or a corrupt header is an error, not a short restore', async () => {
  const whole = archive({ name: 'nonos.db', data: Buffer.alloc(2000, 1) });
  await assert.rejects(rewrite(whole.subarray(0, 1500), { decide: (e) => e.name }), /ended early/);
  const corrupt = Buffer.from(whole);
  corrupt[10] ^= 0xff;
  await assert.rejects(rewrite(corrupt, { decide: (e) => e.name }), /checksum/);
});

test('real tar output with long PAX names streams through and can be renamed', { skip: !hasTar && 'tar is not installed' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-tar-'));
  const long = `uploads/${'x'.repeat(150)}`;
  fs.mkdirSync(path.join(dir, 'data', 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', long), 'long name');
  fs.writeFileSync(path.join(dir, 'data', 'nonos.db'), 'database');
  fs.writeFileSync(path.join(dir, 'data', 'big'), Buffer.alloc(300_000, 7));
  const made = spawnSync('tar', ['--format=pax', '-cf', '-', '-C', dir, 'data'], { maxBuffer: 10 * 1024 * 1024 });
  assert.equal(made.status, 0);
  const out = await rewrite(made.stdout, { decide: (e) => (e.name === 'data/nonos.db' ? 'renamed.db' : e.name.startsWith('data/') ? e.name.slice(5) : null) });
  const listed = spawnSync('tar', ['-tf', '-'], { input: out }).stdout.toString().trim().split('\n').sort();
  assert.deepEqual(listed, ['big', 'renamed.db', 'uploads/', long].sort());
  const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-tar-out-'));
  assert.equal(spawnSync('tar', ['-xf', '-', '-C', extracted], { input: out }).status, 0);
  assert.equal(fs.readFileSync(path.join(extracted, long), 'utf8'), 'long name');
  assert.equal(fs.readFileSync(path.join(extracted, 'renamed.db'), 'utf8'), 'database');
  assert.equal(fs.statSync(path.join(extracted, 'big')).size, 300_000);
});
