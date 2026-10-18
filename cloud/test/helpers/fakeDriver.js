import { Readable, pipeline } from 'node:stream';
import tarEntry from '../../lib/tar/tarEntry.js';
import tarBlocks from '../../lib/tar/tarBlocks.js';
import rewriteTar from '../../lib/tar/rewriteTar.js';
import dataLayout from '../../runtime/dataLayout.js';
import collect from './collect.js';
import readTar from './readTar.js';

const CHECKPOINT = dataLayout.checkpointDir;

// The runtime interface (see runtime/createDriver.js) in memory. A volume is a Map of path to
// contents. Starting an image "migrates" the database by appending the image name to it, so
// tests can tell exactly which version last touched the data. Images in `unhealthy` start but
// never pass their health check; `fail` makes the next call of an operation throw.
export default function fakeDriver() {
  const containers = new Map();
  const volumes = new Map();
  const calls = [];
  const fail = {};
  const unhealthy = new Set();
  const probes = new Map();
  // images "on the server", for hasImage; ensureImage accepts any
  const images = new Set();

  const container = (id) => {
    const c = containers.get(id);
    if (!c) throw Object.assign(new Error(`no container ${id}`), { status: 404 });
    return c;
  };
  const volumeOf = (id) => volumes.get(container(id).spec.volume);
  const step = (op, ...args) => {
    calls.push([op, ...args]);
    if (fail[op]) {
      const err = fail[op];
      delete fail[op];
      throw err;
    }
  };

  return {
    name: 'fake',
    calls,
    containers,
    volumes,
    fail,
    unhealthy,
    probes,

    upstream: (id) => `nil-${id}:3000`,
    images,
    async hasImage(image) {
      return images.has(image);
    },
    async ensureImage(image) {
      step('ensureImage', image);
    },
    async create(spec) {
      step('create', spec.id);
      if (containers.has(spec.id)) throw new Error('container exists');
      if (!volumes.has(spec.volume)) volumes.set(spec.volume, new Map());
      containers.set(spec.id, { spec, running: false });
    },
    async start(id) {
      step('start', id);
      const c = container(id);
      c.running = true;
      const volume = volumes.get(c.spec.volume);
      const db = volume.get(dataLayout.db)?.toString() ?? 'db';
      if (!db.endsWith(`>${c.spec.image}`)) volume.set(dataLayout.db, Buffer.from(`${db}>${c.spec.image}`));
    },
    async stop(id) {
      step('stop', id);
      if (containers.has(id)) containers.get(id).running = false;
    },
    async restart(id) {
      step('restart', id);
      container(id).running = true;
    },
    async remove(id) {
      step('remove', id);
      containers.delete(id);
    },
    async destroy(id, list) {
      step('destroy', id);
      containers.delete(id);
      for (const v of list) volumes.delete(v);
    },
    async removeVolume(volume) {
      step('removeVolume', volume);
      volumes.delete(volume);
    },
    async status(id) {
      const c = containers.get(id);
      if (!c) return { exists: false, running: false, health: 'none', report: null };
      const healthy = c.running && !unhealthy.has(c.spec.image) && !c.sick;
      return { exists: true, running: c.running, health: c.running ? (healthy ? 'healthy' : 'unhealthy') : 'none', report: healthy ? { ok: true, members: 4 } : null, image: c.spec.image, exitCode: 0 };
    },
    async probe(id, path) {
      step('probe', id, path);
      return probes.get(id) ?? null;
    },
    async exportData(id) {
      step('exportData', id);
      const files = [...volumeOf(id)].filter(([name]) => !name.startsWith(CHECKPOINT)).sort(([a], [b]) => (a < b ? -1 : 1));
      return Readable.from([Buffer.concat([...files.map(([name, data]) => tarEntry({ name, data })), tarBlocks.end()])]);
    },
    async importData(id, readable) {
      step('importData', id);
      if (container(id).running) throw new Error('import into a running container');
      const checked = rewriteTar({ decide: dataLayout.restoreDecide });
      pipeline(readable, checked, () => {});
      const volume = volumeOf(id);
      for (const entry of readTar(await collect(checked))) if (entry.type === 'file') volume.set(entry.name, Buffer.from(entry.data));
    },
    async checkpoint(id) {
      step('checkpoint', id);
      if (container(id).running) throw new Error('checkpoint of a running container');
      const volume = volumeOf(id);
      volume.set(`${CHECKPOINT}/${dataLayout.db}`, volume.get(dataLayout.db) ?? Buffer.alloc(0));
      volume.set(`${CHECKPOINT}/${dataLayout.db}-wal`, volume.get(`${dataLayout.db}-wal`) ?? Buffer.alloc(0));
    },
    async restoreCheckpoint(id) {
      step('restoreCheckpoint', id);
      if (container(id).running) throw new Error('rollback into a running container');
      const volume = volumeOf(id);
      if (!volume.has(`${CHECKPOINT}/${dataLayout.db}`)) throw new Error('no checkpoint');
      volume.set(dataLayout.db, volume.get(`${CHECKPOINT}/${dataLayout.db}`));
      volume.set(`${dataLayout.db}-wal`, volume.get(`${CHECKPOINT}/${dataLayout.db}-wal`));
      volume.set(`${dataLayout.db}-shm`, Buffer.alloc(0));
    },
    async discardCheckpoint(id) {
      step('discardCheckpoint', id);
      if (!container(id).running) throw new Error('discard needs a running container');
      const volume = volumeOf(id);
      for (const name of [...volume.keys()]) if (name.startsWith(`${CHECKPOINT}/`)) volume.delete(name);
    },
    async attachProxy(id) {
      step('attachProxy', id);
    },
    async ensureProxy() {
      return 0;
    },
    async usage() {
      return new Map([...volumes].map(([name, files]) => [name, [...files.values()].reduce((sum, b) => sum + b.length, 0)]));
    },
  };
}
