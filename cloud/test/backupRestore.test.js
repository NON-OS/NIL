import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import backupKeys from '../backups/backupKeys.js';
import openStream from '../backups/openStream.js';
import readManifest from '../backups/readManifest.js';
import backupWorkspace from '../backups/backupWorkspace.js';
import backupAll from '../backups/backupAll.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import restoreWorkspace from '../provisioning/restoreWorkspace.js';
import readTar from './helpers/readTar.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'b'.repeat(40)}`;

test('a workspace backup is ciphertext on the target and restores into another workspace', async () => {
  const ctx = testContext({ backups: true });
  const source = createWorkspace(ctx, { name: 'acme', owner: OWNER });
  await provisionWorkspace(ctx, source.id);
  const volume = ctx.driver.volumes.get(source.volume);
  volume.set('uploads/abc123', Buffer.from('a file someone attached'));
  volume.set('keys/receipts-ed25519.pem', Buffer.from('signing key'));

  const result = await backupWorkspace(ctx, ctx.store.workspaces.get(source.id), 'manual');
  assert.match(result.location, new RegExp(`/workspaces/${source.id}/[0-9T-]+Z-manual\\.nilbackup$`));
  const stored = fs.readFileSync(result.location);
  assert.ok(!stored.includes('a file someone attached') && !stored.includes('acme'), 'the target holds ciphertext only, not even the name');
  assert.equal(ctx.store.backups.latest(source.id).kind, 'manual');

  const plain = openStream(backupKeys.parseSecret(ctx.secretKey));
  pipeline(fs.createReadStream(result.location), plain).catch(() => {});
  const { manifest, rest } = await readManifest(plain);
  assert.equal(manifest.name, 'acme');
  assert.equal(manifest.owner, OWNER);
  assert.equal(manifest.kind, 'manual');

  const target = createWorkspace(ctx, { name: 'acme-copy', owner: OWNER });
  await provisionWorkspace(ctx, target.id);
  const oldVolume = ctx.store.workspaces.get(target.id).volume;
  const restored = await restoreWorkspace(ctx, { name: 'acme-copy', tar: rest, manifest });
  assert.equal(restored.state, 'active');
  assert.notEqual(restored.volume, oldVolume);
  assert.equal(ctx.driver.volumes.has(oldVolume), false, 'the replaced volume is removed once the restore is healthy');
  const files = ctx.driver.volumes.get(restored.volume);
  assert.equal(files.get('uploads/abc123').toString(), 'a file someone attached');
  assert.equal(files.get('keys/receipts-ed25519.pem').toString(), 'signing key');
  assert.equal(files.has('.nil-cloud.json'), false);
});

test('a failed restore leaves the workspace and its data as they were', async () => {
  const ctx = testContext({ backups: true });
  const ws = createWorkspace(ctx, { name: 'acme', owner: OWNER });
  await provisionWorkspace(ctx, ws.id);
  const before = ctx.store.workspaces.get(ws.id);
  const evil = Readable.from([Buffer.concat([readTarEntry('../../etc/passwd'), Buffer.alloc(1024)])]);
  await assert.rejects(restoreWorkspace(ctx, { name: 'acme', tar: evil }), /Unsafe path/);
  const after = ctx.store.workspaces.get(ws.id);
  assert.equal(after.state, 'active');
  assert.equal(after.volume, before.volume);
  assert.ok(ctx.driver.volumes.has(before.volume));
  assert.equal(ctx.driver.containers.get(ws.id).running, true);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.restore_failed');
});

test('a backup can rebuild a workspace this control plane has never seen', async () => {
  const first = testContext({ backups: true });
  const ws = createWorkspace(first, { name: 'acme', owner: OWNER, plan: 'pro' });
  await provisionWorkspace(first, ws.id);
  const { location } = await backupWorkspace(first, first.store.workspaces.get(ws.id));

  const second = testContext();
  const plain = openStream(backupKeys.parseSecret(first.secretKey));
  pipeline(fs.createReadStream(location), plain).catch(() => {});
  const { manifest, rest } = await readManifest(plain);
  const rebuilt = await restoreWorkspace(second, { name: 'acme', tar: rest, manifest });
  assert.equal(rebuilt.owner, OWNER);
  assert.equal(rebuilt.plan, 'pro');
  assert.equal(rebuilt.state, 'active');
});

test('the nightly run backs up every workspace and the control database, and prunes old files', async () => {
  const ctx = testContext({ backups: true });
  for (const name of ['one', 'two']) await provisionWorkspace(ctx, createWorkspace(ctx, { name, owner: OWNER }).id);
  const dir = path.join(ctx.dataDir, 'backups');
  const stale = path.join(dir, 'workspaces', 'gone', '2020-01-01T00-00-00-000Z-final.nilbackup');
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, 'old');
  fs.utimesSync(stale, new Date('2020-01-01'), new Date('2020-01-01'));

  const summary = await backupAll(ctx);
  assert.deepEqual(summary, { done: 2, failed: [], pruned: 1 });
  assert.equal(fs.existsSync(stale), false, 'a deleted workspace’s final backup expires like any other');
  assert.equal(fs.readdirSync(path.join(dir, 'control')).length, 1);
  assert.equal(fs.readdirSync(path.join(dir, 'workspaces')).length, 2);
});

test('backups refuse to run when the backup share isn’t mounted', async () => {
  const ctx = testContext({ backups: true });
  fs.rmSync(path.join(ctx.dataDir, 'backups', '.nil-backup-target'));
  await assert.rejects(backupAll(ctx), /mounted/);
});

function readTarEntry(name) {
  // a hand-made entry whose path climbs out of the data folder
  const block = Buffer.alloc(512);
  block.write(name, 0);
  block.write('0000600\0', 100);
  block.write('00000000000\0', 124);
  block.write('0', 156);
  block.write('ustar\0', 257);
  block.write('00', 263);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : block[i];
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  assert.equal(readTar(Buffer.concat([block, Buffer.alloc(1024)]))[0].name, name);
  return block;
}
