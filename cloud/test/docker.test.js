import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import dockerDriver from '../runtime/docker/dockerDriver.js';
import dockerClient from '../runtime/docker/dockerClient.js';
import containerBody from '../runtime/docker/containerBody.js';
import readExecOutput from '../runtime/docker/readExecOutput.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import caddyReloader from '../routing/caddyReloader.js';
import loadConfig from '../config/loadConfig.js';
import tarEntry from '../lib/tar/tarEntry.js';
import tarBlocks from '../lib/tar/tarBlocks.js';
import baseEnv from './helpers/baseEnv.js';
import collect from './helpers/collect.js';
import readTar from './helpers/readTar.js';

const ID = '0123456789abcdef';
const frame = (stream, text) => {
  const body = Buffer.from(text);
  const head = Buffer.alloc(8);
  head[0] = stream;
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
};

// Just enough of the Docker Engine API, on a unix socket, recording what it was asked.
async function fakeEngine(t, env = {}) {
  const socket = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nil-docker-')), 'docker.sock');
  const seen = [];
  const state = { networks: new Set(), volumes: new Set(), busy: new Map(), stuck: new Set(), lingering: new Map(), connected: new Set(), joined: new Map(), disconnected: [], containers: new Map(), removed: [], waited: [], helperExit: 0, mtimes: new Map(), execs: new Map(), uploads: [], locked: new Map(), volume: new Map([['nonos.db', 'live-db'], ['nonos.db-wal', 'live-wal']]) };
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://docker');
    // Docker holds a container's lock for the whole of an archive read or write
    const archived = req.method !== 'HEAD' && /^(?:\/v1\.44)?\/containers\/([^/]+)\/archive$/.exec(url.pathname);
    if (archived) {
      while (state.locked.has(archived[1])) await state.locked.get(archived[1]);
      let unlock;
      state.locked.set(archived[1], new Promise((resolve) => (unlock = resolve)));
      res.on('close', () => {
        state.locked.delete(archived[1]);
        unlock();
      });
    }
    const body = await collect(req);
    seen.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    const route = `${req.method} ${url.pathname.replace(/^\/v1\.44/, '')}`;
    let m;
    if (route === 'POST /networks/create') {
      const { Name } = JSON.parse(body);
      if (state.networks.has(Name)) return json(res, 409, { message: `network with name ${Name} already exists` });
      state.networks.add(Name);
      return json(res, 201, { Id: 'net1' });
    }
    if ((m = /^POST \/networks\/([^/]+)\/connect$/.exec(route))) {
      const { Container } = JSON.parse(body);
      const joined = state.joined.get(Container) ?? new Set();
      if (joined.has(m[1])) return json(res, 403, { message: `endpoint with name ${Container} already exists in network` });
      joined.add(m[1]);
      state.joined.set(Container, joined);
      if (Container === 'nil-caddy') state.connected.add(m[1]);
      return json(res, 200);
    }
    if (route === 'POST /volumes/create') {
      state.volumes.add(JSON.parse(body).Name);
      return json(res, 201, { Name: JSON.parse(body).Name });
    }
    // something Docker can't let go of yet: `busy` answers 409 that many times, `stuck` always
    const inUse = (name) => {
      if (state.stuck.has(name)) return true;
      const left = state.busy.get(name) ?? 0;
      if (left) state.busy.set(name, left - 1);
      return left > 0;
    };
    if (route === 'GET /containers/json') {
      const [label] = JSON.parse(url.searchParams.get('filters')).label;
      const [key, value] = label.split('=');
      return json(res, 200, [...state.containers].filter(([, c]) => c.body.Labels?.[key] === value).map(([name]) => ({ Id: name, Names: [`/${name}`] })));
    }
    if (route === 'POST /containers/create') {
      state.containers.set(url.searchParams.get('name'), { running: false, body: JSON.parse(body) });
      return json(res, 201, { Id: 'c1' });
    }
    if ((m = /^GET \/containers\/([^/]+)\/json$/.exec(route))) {
      // a forced removal that is still finishing: Docker keeps showing the container a while
      const lingers = state.lingering.get(m[1]) ?? 0;
      if (lingers) {
        state.lingering.set(m[1], lingers - 1);
        return json(res, 200, { Config: {}, State: { Running: false } });
      }
      if (m[1] === 'nil-caddy' || m[1] === 'nil-egress') return json(res, 200, { NetworkSettings: { Networks: Object.fromEntries([...(state.joined.get(m[1]) ?? [])].map((n) => [n, {}])) } });
      const c = state.containers.get(m[1]);
      if (!c) return json(res, 404, { message: `No such container: ${m[1]}` });
      return json(res, 200, { Config: { Image: c.body.Image }, State: { Running: c.running, ExitCode: 0, StartedAt: '2026-10-21T08:00:00.000000000Z', Health: { Status: c.running ? 'healthy' : 'unhealthy', Log: [{ Output: '{"ok":true,"version":"3.1.0","schema":19,"members":7,"secret":"x","jobs":{"purge":1}}' }] } } });
    }
    if ((m = /^POST \/containers\/([^/]+)\/wait$/.exec(route))) {
      state.waited.push(m[1]);
      return json(res, 200, { StatusCode: state.helperExit, Error: null });
    }
    if ((m = /^HEAD \/containers\/([^/]+)\/archive$/.exec(route))) {
      const name = path.basename(url.searchParams.get('path'));
      if (!state.mtimes.has(name)) return json(res, 404, { message: 'Could not find the file' });
      res.writeHead(200, { 'x-docker-container-path-stat': Buffer.from(JSON.stringify({ name, size: 1, mode: 384, mtime: state.mtimes.get(name) })).toString('base64') });
      return res.end();
    }
    if ((m = /^POST \/containers\/([^/]+)\/start$/.exec(route))) {
      const c = state.containers.get(m[1]);
      if (c.running) return json(res, 304);
      c.running = true;
      return json(res, 204);
    }
    if ((m = /^POST \/containers\/([^/]+)\/stop$/.exec(route))) {
      const c = state.containers.get(m[1]);
      if (!c) return json(res, 404, { message: 'No such container' });
      c.running = false;
      return json(res, 204);
    }
    if ((m = /^DELETE \/containers\/([^/]+)$/.exec(route))) {
      if (inUse(m[1])) return json(res, 409, { message: `removal of container ${m[1]} is already in progress` });
      if (!state.containers.delete(m[1])) return json(res, 404, { message: 'No such container' });
      state.removed.push(m[1]);
      return json(res, 204);
    }
    if ((m = /^DELETE \/(networks|volumes)\/([^/]+)$/.exec(route))) {
      if (inUse(m[2])) return json(res, 409, { message: `${m[2]} is in use` });
      return state[m[1]].delete(m[2]) ? json(res, 204) : json(res, 404, { message: 'not found' });
    }
    if ((m = /^GET \/(networks|volumes)\/([^/]+)$/.exec(route))) return state[m[1]].has(m[2]) ? json(res, 200, { Name: m[2] }) : json(res, 404, { message: 'not found' });
    if ((m = /^POST \/networks\/([^/]+)\/disconnect$/.exec(route))) {
      state.disconnected.push([m[1], JSON.parse(body).Container]);
      return json(res, 404, { message: 'network not found' });
    }
    if ((m = /^POST \/containers\/([^/]+)\/exec$/.exec(route))) {
      const id = `e${state.execs.size + 1}`;
      state.execs.set(id, JSON.parse(body));
      return json(res, 201, { Id: id });
    }
    if ((m = /^POST \/exec\/([^/]+)\/start$/.exec(route))) {
      const { Cmd } = state.execs.get(m[1]);
      res.writeHead(200, { 'content-type': 'application/vnd.docker.multiplexed-stream' });
      if (Cmd[0] === 'wget') return res.end(Buffer.concat([frame(2, 'Connecting to 127.0.0.1:3000\n'), frame(1, '{"needsSetup":'), frame(1, 'false}')]));
      if (Cmd[0] === 'caddy') return res.end(frame(2, 'Error: adapting config using caddyfile: unknown directive\n'));
      return res.end();
    }
    if ((m = /^GET \/exec\/([^/]+)\/json$/.exec(route))) return json(res, 200, { ExitCode: state.execs.get(m[1]).Cmd[0] === 'caddy' ? 1 : 0, Running: false });
    if ((m = /^GET \/containers\/([^/]+)\/archive$/.exec(route))) {
      const p = url.searchParams.get('path');
      const name = path.basename(p);
      if (p !== '/data' && p !== '/data/.nil-checkpoint' && !state.volume.has(name)) return json(res, 404, { message: 'Could not find the file' });
      res.writeHead(200, { 'content-type': 'application/x-tar' });
      if (p === '/data') {
        return res.end(Buffer.concat([
          tarEntry({ name: 'data', type: 'dir' }),
          tarEntry({ name: 'data/nonos.db', data: Buffer.from('live-db') }),
          tarEntry({ name: 'data/.nil-snapshot/nonos.db', data: Buffer.from('snapshot-db') }),
          tarEntry({ name: 'data/uploads/u1', data: Buffer.from('upload') }),
          tarBlocks.end(),
        ]));
      }
      if (p === '/data/.nil-checkpoint') return res.end(Buffer.concat([tarEntry({ name: '.nil-checkpoint', type: 'dir' }), tarEntry({ name: '.nil-checkpoint/nonos.db', data: Buffer.from('old-db') }), tarEntry({ name: '.nil-checkpoint/nonos.db-wal', data: Buffer.alloc(0) }), tarBlocks.end()]));
      return res.end(Buffer.concat([tarEntry({ name, data: Buffer.from(state.volume.get(name)) }), tarBlocks.end()]));
    }
    if ((m = /^PUT \/containers\/([^/]+)\/archive$/.exec(route))) {
      state.uploads.push({ query: Object.fromEntries(url.searchParams), entries: readTar(body) });
      return json(res, 200);
    }
    if ((m = /^GET \/images\/(.+)\/json$/.exec(route))) return json(res, 404, { message: 'No such image' });
    if (route === 'POST /images/create') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"status":"Pulling from nonos/nil"}\n{"errorDetail":{"message":"denied"},"error":"pull access denied for nonos/nil"}\n');
    }
    if (route === 'GET /system/df') return json(res, 200, { Volumes: [{ Name: `nil-${ID}-data`, UsageData: { Size: 4096 } }, { Name: 'other', UsageData: { Size: -1 } }] });
    json(res, 500, { message: `unexpected ${route}` });
  });
  await new Promise((resolve) => server.listen(socket, resolve));
  t.after(() => server.close());
  const { config } = loadConfig({ ...baseEnv, CLOUD_DOCKER_SOCKET: socket, CLOUD_DATA_DIR: path.dirname(socket), CLOUD_IMAGE_PULL: 'missing', CLOUD_DOCKER_REMOVE_WAIT_MS: '1', ...env });
  const log = { info() {}, warn() {}, error() {} };
  return { config, seen, state, driver: dockerDriver({ config, log }) };
}

test('each workspace gets an internal network, Caddy attached to it, a volume and a hardened container', async (t) => {
  const { config, seen, state, driver } = await fakeEngine(t);
  const spec = workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard', setupToken: 'tok', invoiceSlot: 7 });
  await driver.create(spec);
  const network = JSON.parse(seen.find((r) => r.path.endsWith('/networks/create')).body);
  assert.deepEqual(network, { Name: `nil-${ID}`, Driver: 'bridge', Internal: true, EnableIPv6: false, Labels: { 'org.nonos.cloud.workspace': ID } });
  assert.ok(state.connected.has(`nil-${ID}`));
  const body = state.containers.get(`nil-${ID}`).body;
  assert.deepEqual(body, containerBody(spec, { appPort: 3000, tmpfsMb: 64, logMb: 10, logFiles: 3, healthIntervalSec: 30, startTimeoutSec: 120, stopTimeoutSec: 15 }));
  assert.equal(body.User, '200007:200007', 'its own uid, never 1000 like the control plane');

  // before the container exists, a helper hands the volume to that uid, then goes away
  const creates = seen.filter((r) => r.path.endsWith('/containers/create'));
  assert.deepEqual(creates.map((r) => r.query.name), [`nil-${ID}-owner`, `nil-${ID}`]);
  const helper = JSON.parse(creates[0].body);
  assert.deepEqual(helper.Entrypoint, ['chown', '-hR', '200007:200007', '/data']);
  assert.equal(helper.User, '0:0');
  assert.deepEqual(helper.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(helper.HostConfig.CapAdd, ['CHOWN', 'DAC_READ_SEARCH']);
  assert.equal(helper.HostConfig.NetworkMode, 'none');
  assert.equal(helper.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(helper.HostConfig.Mounts, [{ Type: 'volume', Source: `nil-${ID}-data`, Target: '/data', VolumeOptions: { NoCopy: true } }]);
  assert.deepEqual(state.waited, [`nil-${ID}-owner`]);
  assert.ok(state.removed.includes(`nil-${ID}-owner`));
  assert.equal(state.containers.has(`nil-${ID}-owner`), false);
  assert.equal(body.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(body.HostConfig.CapDrop, ['ALL']);
  assert.deepEqual(body.HostConfig.SecurityOpt, ['no-new-privileges:true']);
  assert.equal(body.HostConfig.NetworkMode, `nil-${ID}`);
  assert.equal(body.HostConfig.Memory, body.HostConfig.MemorySwap, 'no swap');
  assert.equal(body.HostConfig.NanoCpus, 1e9);
  assert.equal(body.HostConfig.PidsLimit, 256);
  assert.match(body.HostConfig.Tmpfs['/tmp'], /noexec,nosuid,nodev,size=64m/);
  assert.deepEqual(body.HostConfig.Mounts, [{ Type: 'volume', Source: `nil-${ID}-data`, Target: '/data', VolumeOptions: { NoCopy: true } }]);
  assert.deepEqual(body.Healthcheck.Test, ['CMD', 'wget', '-qO-', '-T', '5', 'http://127.0.0.1:3000/healthz']);
  assert.ok(body.Env.includes('SETUP_TOKEN=tok'));

  // creating again finds the network and the Caddy connection already there
  state.containers.delete(`nil-${ID}`);
  await driver.create(spec);
  assert.equal(await driver.ensureProxy([ID]), 0);
});

test('with the egress proxy on, it joins every workspace network next to Caddy, and leaves with it', async (t) => {
  const { driver, state, config } = await fakeEngine(t, { CLOUD_EGRESS_PROXY: 'on' });
  const spec = workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' });
  assert.equal(spec.env.EGRESS_PROXY, `http://${ID}@nil-egress:3128`);
  assert.equal(spec.env.AGENT_OUTBOUND, undefined, 'outbound tools stay on');
  await driver.create(spec);
  assert.deepEqual([...state.joined.get('nil-caddy')], [`nil-${ID}`]);
  assert.deepEqual([...state.joined.get('nil-egress')], [`nil-${ID}`]);

  // the egress container was recreated and lost its networks: only it is reattached
  state.joined.set('nil-egress', new Set());
  assert.equal(await driver.ensureProxy([ID]), 1);
  assert.deepEqual([...state.joined.get('nil-egress')], [`nil-${ID}`]);
  assert.equal(await driver.ensureProxy([ID]), 0);

  await driver.destroy(ID, [`nil-${ID}-data`]);
  assert.deepEqual(state.disconnected.map(([, container]) => container).sort(), ['nil-caddy', 'nil-egress']);
});

test('status, probes and usage read only small, typed values from the workspace', async (t) => {
  const { driver, state, config } = await fakeEngine(t);
  assert.deepEqual(await driver.status('missing'), { exists: false, running: false, health: 'none', report: null });
  await driver.create(workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' }));
  await driver.start(ID);
  await driver.start(ID);
  const status = await driver.status(ID);
  assert.deepEqual(status.report, { ok: true, version: '3.1.0', schema: 19, members: 7 }, 'unknown fields from inside the workspace are dropped');
  assert.equal(status.health, 'healthy');
  assert.deepEqual(await driver.probe(ID, '/api/auth/state'), { needsSetup: false });
  assert.deepEqual(state.execs.get('e1').Cmd, ['wget', '-qO-', '-T', '5', 'http://127.0.0.1:3000/api/auth/state']);
  await assert.rejects(driver.probe(ID, '/x;rm -rf /'), /Invalid probe path/);
  assert.deepEqual([...(await driver.usage())], [[`nil-${ID}-data`, 4096]]);
});

test('exports snapshot a running database first; imports, checkpoints and rollbacks go through the archive API', async (t) => {
  const { driver, state, config } = await fakeEngine(t);
  await driver.create(workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' }));
  await driver.start(ID);
  const exported = readTar(await collect(await driver.exportData(ID)));
  assert.deepEqual(exported.map((e) => `${e.name}=${e.data}`), ['nonos.db=snapshot-db', 'uploads/u1=upload']);
  const snapshot = state.execs.get('e1');
  assert.equal(snapshot.Cmd[0], 'node');
  assert.match(snapshot.Cmd.at(-1), /VACUUM INTO '\/data\/\.nil-snapshot\/nonos\.db'/);
  assert.equal(snapshot.User, undefined, 'as the container’s own user');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(state.execs.get('e2').Cmd, ['rm', '-rf', '/data/.nil-snapshot'], 'the snapshot is removed once streamed');

  await driver.stop(ID);
  await driver.importData(ID, Readable.from([Buffer.concat([tarEntry({ name: '.nil-cloud.json', data: Buffer.from('{}') }), tarEntry({ name: 'nonos.db', data: Buffer.from('restored') }), tarBlocks.end()])]));
  assert.deepEqual(state.uploads[0].query, { path: '/data', copyUIDGID: 'true' });
  assert.deepEqual(state.uploads[0].entries.map((e) => e.name), ['nonos.db']);

  await driver.checkpoint(ID);
  assert.deepEqual(state.uploads[1].entries.map((e) => `${e.name}=${e.data}`), ['.nil-checkpoint=', '.nil-checkpoint/nonos.db=live-db', '.nil-checkpoint/nonos.db-wal=live-wal']);
  state.volume.delete('nonos.db-wal');
  await driver.checkpoint(ID);
  assert.deepEqual(state.uploads[2].entries.map((e) => `${e.name}=${e.data}`), ['.nil-checkpoint=', '.nil-checkpoint/nonos.db=live-db', '.nil-checkpoint/nonos.db-wal='], 'a missing WAL is checkpointed as an empty one');

  await driver.restoreCheckpoint(ID);
  assert.deepEqual(state.uploads[3].entries.map((e) => `${e.name}=${e.data}`), ['nonos.db=old-db', 'nonos.db-wal=', 'nonos.db-shm=']);
});

test('pull failures reported mid-stream, missing things on removal, and Caddy refusing a config', async (t) => {
  const { driver, config } = await fakeEngine(t);
  await assert.rejects(driver.ensureImage('nonos/nil:9.9.9'), /pull access denied/);
  await driver.destroy('ffffffffffffffff', ['nil-ffffffffffffffff-data']);
  await assert.rejects(caddyReloader({ ...config, caddy: { ...config.caddy, container: 'nil-caddy' } })(), /Caddy rejected the configuration: Error: adapting config/);
  assert.equal(await caddyReloader({ ...config, caddy: { ...config.caddy, container: null } })(), false);
});

test('removing a workspace waits out what Docker still holds and sweeps up helpers left behind', async (t) => {
  const { driver, state, config, seen } = await fakeEngine(t);
  const volume = `nil-${ID}-drill`;
  await driver.create({ ...workspaceSpec(config, { id: ID, name: 'restore-drill', image: 'nonos/nil:1.0.0', volume, plan: 'standard' }), isolated: true });
  // a helper an interrupted import left behind still holds the volume
  state.containers.set(`nil-${ID}-import`, { running: false, body: { Labels: { 'org.nonos.cloud.role': 'helper', 'org.nonos.cloud.workspace': ID } } });
  state.lingering.set(`nil-${ID}`, 2);
  state.busy.set(`nil-${ID}`, 1);
  state.busy.set(volume, 2);

  await driver.destroy(ID, [volume]);
  assert.equal(state.containers.size, 0, 'the workspace and the forgotten helper are both gone');
  assert.equal(state.networks.has(`nil-${ID}`), false);
  assert.equal(state.volumes.has(volume), false);
  assert.equal(seen.filter((r) => r.method === 'DELETE' && r.path.endsWith(`/volumes/${volume}`)).length, 3, 'two refusals, then removed');
  assert.ok(seen.filter((r) => r.method === 'GET' && r.path.endsWith(`/containers/nil-${ID}/json`)).length >= 3, 'it waited until Docker no longer knew the container');
});

test('what can’t be removed is named, with the commands that remove it by hand', async (t) => {
  const { driver, state, config, seen } = await fakeEngine(t);
  const volume = `nil-${ID}-drill`;
  await driver.create({ ...workspaceSpec(config, { id: ID, name: 'restore-drill', image: 'nonos/nil:1.0.0', volume, plan: 'standard' }), isolated: true });
  state.stuck.add(volume);
  await assert.rejects(driver.destroy(ID, [volume]), (err) => {
    assert.match(err.message, /left something behind/);
    assert.deepEqual(err.leftovers, { containers: [], networks: [], volumes: [volume], commands: [`docker volume rm ${volume}`] });
    return true;
  });
  assert.equal(seen.filter((r) => r.method === 'DELETE' && r.path.endsWith(`/volumes/${volume}`)).length, config.docker.removeTries, 'retried a bounded number of times');
  assert.equal(state.containers.size, 0, 'everything else still went');
  assert.equal(state.networks.has(`nil-${ID}`), false);
});

test('a helper that can’t hand over the volume stops the create; last writes come from file times only', async (t) => {
  const { driver, state, config, seen } = await fakeEngine(t);
  state.helperExit = 1;
  await assert.rejects(driver.create(workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' })), /own user failed \(exit code 1\)/);
  assert.equal(state.containers.size, 0, 'neither the helper nor the workspace container is left');
  state.helperExit = 0;
  assert.equal(await driver.lastWrite(ID), null, 'no container, nothing to read');
  await driver.create(workspaceSpec(config, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' }));
  state.mtimes.set('nonos.db', '2026-10-21T09:00:00Z');
  state.mtimes.set('nonos.db-wal', '2026-10-21T10:30:00Z');
  assert.deepEqual(await driver.lastWrite(ID), { at: Date.parse('2026-10-21T10:30:00Z'), startedAt: Date.parse('2026-10-21T08:00:00Z') });
  const heads = seen.filter((r) => r.method === 'HEAD');
  assert.deepEqual(heads.map((r) => r.query.path).sort(), ['/data/nonos.db', '/data/nonos.db-wal']);
});

test('an isolated workspace (a restore drill) gets an internal network without Caddy', async (t) => {
  const { state, config, seen } = await fakeEngine(t);
  const { config: open } = loadConfig({ ...baseEnv, CLOUD_DOCKER_SOCKET: config.docker.socket, CLOUD_EGRESS: 'open' });
  const spec = workspaceSpec(open, { id: ID, name: 'restore-drill', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-drill`, plan: 'standard' });
  await dockerDriver({ config: open, log: { info() {}, warn() {}, error() {} } }).create({ ...spec, isolated: true });
  const network = JSON.parse(seen.find((r) => r.path.endsWith('/networks/create')).body);
  assert.equal(network.Internal, true, 'even with open egress');
  assert.equal(network.EnableIPv6, false, 'no IPv6 either');
  assert.equal(state.connected.size, 0, 'Caddy is never attached');
});

test('with open egress a workspace network routes out over IPv4 only', async (t) => {
  const { config, seen } = await fakeEngine(t);
  const { config: open } = loadConfig({ ...baseEnv, CLOUD_DOCKER_SOCKET: config.docker.socket, CLOUD_EGRESS: 'open' });
  const spec = workspaceSpec(open, { id: ID, name: 'acme', image: 'nonos/nil:1.0.0', volume: `nil-${ID}-data`, plan: 'standard' });
  await dockerDriver({ config: open, log: { info() {}, warn() {}, error() {} } }).create(spec);
  const network = JSON.parse(seen.find((r) => r.path.endsWith('/networks/create')).body);
  assert.equal(network.Internal, false);
  assert.equal(network.EnableIPv6, false, 'the edge network’s IPv6 never reaches a workspace');
});

test('by default a missing image is an error and nothing is pulled', async (t) => {
  const { seen, config } = await fakeEngine(t);
  const { config: defaults } = loadConfig({ ...baseEnv, CLOUD_DOCKER_SOCKET: config.docker.socket });
  assert.equal(defaults.docker.pull, 'never');
  const driver = dockerDriver({ config: defaults, log: { info() {}, warn() {}, error() {} } });
  assert.equal(await driver.hasImage('nonos/nil:9.9.9'), false);
  await assert.rejects(driver.ensureImage('nonos/nil:9.9.9'), /isn’t on this server.*isn’t pulled/);
  assert.equal(seen.filter((r) => r.path.endsWith('/images/create')).length, 0);
});

test('exec output is demultiplexed and capped, whatever the workspace sends', async () => {
  const flood = Readable.from([frame(1, 'a'.repeat(100)), frame(2, 'err'), frame(1, 'b'.repeat(100))]);
  assert.deepEqual(await readExecOutput(flood, 150), { stdout: `${'a'.repeat(100)}${'b'.repeat(50)}`, stderr: 'err' });
  // a frame split across reads at awkward places
  const whole = frame(1, 'hello world');
  assert.deepEqual(await readExecOutput(Readable.from([whole.subarray(0, 3), whole.subarray(3, 10), whole.subarray(10)])), { stdout: 'hello world', stderr: '' });
  const client = dockerClient({ socket: '/nonexistent/docker.sock', apiVersion: '1.44' });
  await assert.rejects(client.json('GET', '/_ping'), /ENOENT/);
});
