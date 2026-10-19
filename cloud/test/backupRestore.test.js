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
import drillRestore from '../provisioning/drillRestore.js';
import restoreDrill from '../cli/commands/restoreDrill.js';
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

test('a rebuilt workspace runs an image from its manifest only if it is ours and already here', async () => {
  const restoreAs = async (ctx, name, image) => {
    const tar = Readable.from([Buffer.alloc(1024)]);
    return restoreWorkspace(ctx, { name, tar, manifest: { name, owner: OWNER, plan: 'standard', image } });
  };
  const ctx = testContext({ env: { CLOUD_APP_IMAGE: 'localhost/nonos/nil:3.0.1' } });
  ctx.driver.images.add('localhost/nonos/nil:3.0.0');
  ctx.driver.images.add('someone/else:latest');
  assert.equal((await restoreAs(ctx, 'older', 'localhost/nonos/nil:3.0.0')).image, 'localhost/nonos/nil:3.0.0');
  assert.equal((await restoreAs(ctx, 'foreign', 'someone/else:latest')).image, 'localhost/nonos/nil:3.0.1', 'another repository is never run, even when present');
  assert.equal((await restoreAs(ctx, 'missing', 'localhost/nonos/nil:9.9.9')).image, 'localhost/nonos/nil:3.0.1', 'an image that isn’t here maps to the current one');
  assert.equal((await restoreAs(ctx, 'hub', 'nonos/nil:3.0.0')).image, 'localhost/nonos/nil:3.0.1');
  const asked = ctx.driver.calls.filter(([op]) => op === 'ensureImage').map(([, image]) => image);
  assert.deepEqual([...new Set(asked)].sort(), ['localhost/nonos/nil:3.0.0', 'localhost/nonos/nil:3.0.1']);
});

test('a restore drill boots the backup where nobody can reach it, then removes it', async () => {
  const ctx = testContext({ backups: true });
  const ws = createWorkspace(ctx, { name: 'customer', owner: OWNER });
  await provisionWorkspace(ctx, ws.id);
  ctx.driver.volumes.get(ws.volume).set('uploads/secret', Buffer.from('a customer’s file'));
  const open = async () => {
    const { location } = await backupWorkspace(ctx, ctx.store.workspaces.get(ws.id), 'manual');
    const plain = openStream(backupKeys.parseSecret(ctx.secretKey));
    pipeline(fs.createReadStream(location), plain).catch(() => {});
    return readManifest(plain);
  };
  const rows = ctx.store.workspaces.list().length;
  const reloads = ctx.reloads.length;
  const containers = new Set(ctx.driver.containers.keys());

  const { manifest, rest } = await open();
  const result = await drillRestore(ctx, { tar: rest, manifest });
  assert.equal(result.report.ok, true);
  assert.equal(result.removed, true);
  assert.equal(result.leftovers, null);
  const [created] = ctx.driver.calls.filter(([op]) => op === 'create').slice(-1);
  assert.equal(created[1], result.id);
  assert.equal(ctx.store.workspaces.list().length, rows, 'the drill is never in the control database, so never routed');
  assert.equal(ctx.reloads.length, reloads, 'Caddy never hears of it');
  assert.deepEqual(new Set(ctx.driver.containers.keys()), containers, 'and it is gone afterwards');
  assert.equal([...ctx.driver.volumes.keys()].some((v) => v.includes(result.id)), false);

  // one that doesn't start is removed just the same
  ctx.driver.unhealthy.add(ctx.config.app.image);
  const again = await open();
  await assert.rejects(drillRestore(ctx, { tar: again.rest, manifest: again.manifest }), /didn’t become healthy/);
  assert.deepEqual(new Set(ctx.driver.containers.keys()), containers);
});

test('a drill whose decrypted copy stays behind says so, alerts, and the command exits with 1', async () => {
  const ctx = testContext({ backups: true });
  const ws = createWorkspace(ctx, { name: 'customer', owner: OWNER });
  await provisionWorkspace(ctx, ws.id);
  const { location } = await backupWorkspace(ctx, ctx.store.workspaces.get(ws.id), 'manual');
  const identity = path.join(ctx.dataDir, 'backup.key');
  fs.writeFileSync(identity, ctx.secretKey, { mode: 0o600 });
  const drill = async () => {
    const lines = [];
    const code = await restoreDrill(ctx, { args: [location], options: { identity }, print: (line) => lines.push(line) });
    return { code, out: lines.join('\n') };
  };

  const fine = await drill();
  assert.equal(fine.code, 0);
  assert.match(fine.out, /The copy has been removed\./);

  // Docker refuses to let go of the drill's volume for good
  const destroy = ctx.driver.destroy;
  ctx.driver.destroy = async (id, volumes) => {
    if (!volumes.every((v) => v.endsWith('-drill'))) return destroy(id, volumes);
    await destroy(id, []);
    throw Object.assign(new Error('volume in use'), { leftovers: { containers: [], networks: [], volumes, commands: volumes.map((v) => `docker volume rm ${v}`) } });
  };
  const stuck = await drill();
  assert.equal(stuck.code, 1);
  assert.doesNotMatch(stuck.out, /has been removed/);
  assert.match(stuck.out, /could NOT be fully removed/);
  assert.match(stuck.out, /docker volume rm nil-[0-9a-f]+-drill/);
  const [alert] = ctx.alerts.filter((a) => a.event === 'drill.cleanup_failed');
  assert.equal(alert.severity, 'critical');
  assert.match(alert.message, /decrypted backup: nil-[0-9a-f]+-drill\. Remove it now: docker volume rm nil-[0-9a-f]+-drill/);

  // a drill that fails and can't clean up says both
  ctx.driver.unhealthy.add(ctx.config.app.image);
  await assert.rejects(drill(), /didn’t become healthy[\s\S]*couldn’t be removed either; remove it now: docker volume rm/);
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
