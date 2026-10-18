import { Readable, pipeline } from 'node:stream';
import dockerClient from './dockerClient.js';
import containerBody from './containerBody.js';
import readExecOutput from './readExecOutput.js';
import ownVolume from './ownVolume.js';
import dataLayout from '../dataLayout.js';
import readHealthReport from '../readHealthReport.js';
import rewriteTar from '../../lib/tar/rewriteTar.js';
import tarEntry from '../../lib/tar/tarEntry.js';
import tarBlocks from '../../lib/tar/tarBlocks.js';

const { mount, db: DB, snapshotDir, checkpointDir } = dataLayout;

// VACUUM INTO writes a consistent copy of the live database while the app keeps running. It
// runs inside the workspace, as the workspace's own user (an exec runs as the container's user
// unless told otherwise), with the node already in the image.
const SNAPSHOT_SCRIPT = [
  "const fs = require('node:fs');",
  `fs.rmSync('${mount}/${snapshotDir}', { recursive: true, force: true });`,
  `fs.mkdirSync('${mount}/${snapshotDir}', { mode: 0o700 });`,
  `const db = new (require('node:sqlite').DatabaseSync)('${mount}/${DB}');`,
  "db.exec('PRAGMA busy_timeout = 15000');",
  `db.exec("VACUUM INTO '${mount}/${snapshotDir}/${DB}'");`,
  'db.close();',
].join(' ');

const containerName = (id) => `nil-${id}`;

// Runs workspaces as Docker containers through the Engine API on the local socket. See
// createDriver.js for the interface every runtime implements.
export default function dockerDriver({ config, log, client = dockerClient(config.docker) }) {
  const { app, caddy, docker } = config;
  const settings = {
    appPort: app.port,
    tmpfsMb: app.tmpfsMb,
    logMb: app.logMb,
    logFiles: app.logFiles,
    healthIntervalSec: app.healthIntervalSec,
    startTimeoutSec: app.startTimeoutSec,
    stopTimeoutSec: app.stopTimeoutSec,
  };
  const archive = (id) => `/containers/${containerName(id)}/archive`;

  async function exec(id, cmd) {
    const created = await client.json('POST', `/containers/${containerName(id)}/exec`, { body: { Cmd: cmd, AttachStdout: true, AttachStderr: true } });
    const output = await readExecOutput(await client.stream('POST', `/exec/${created.Id}/start`, { body: { Detach: false, Tty: false } }));
    const info = await client.json('GET', `/exec/${created.Id}/json`);
    return { exitCode: info.ExitCode, ...output };
  }

  // An archive of one path inside the workspace, rewritten entry by entry. Null if the path
  // doesn't exist. Errors on the Docker side reach whoever reads the returned stream.
  async function readArchive(id, path, decide, end) {
    let res;
    try {
      res = await client.stream('GET', archive(id), { query: { path } });
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
    const out = rewriteTar({ decide, end });
    pipeline(res, out, () => {});
    return out;
  }

  async function writeArchive(id, body) {
    // copyUIDGID hands every extracted file to the container's user, whatever the archive says
    await client.json('PUT', archive(id), { query: { path: mount, copyUIDGID: 'true' }, body, headers: { 'content-type': 'application/x-tar' }, timeout: 600_000 });
  }

  async function attachProxy(id) {
    if (!caddy.container) return;
    try {
      await client.json('POST', `/networks/${containerName(id)}/connect`, { body: { Container: caddy.container } });
    } catch (err) {
      if (!(err.status === 409 || (err.status === 403 && /already exists/i.test(err.reason)))) throw err;
    }
  }

  const driver = {
    name: 'docker',

    upstream: (id) => `${containerName(id)}:${app.port}`,

    hasImage: async (image) => Boolean(await client.quiet('GET', `/images/${encodeURIComponent(image)}/json`)),

    // Images arrive with deploy/release.sh, so by default (CLOUD_IMAGE_PULL=never) nothing is
    // ever pulled: a missing image is an error, never a download from whoever owns that name.
    async ensureImage(image) {
      const present = await driver.hasImage(image);
      if (present && docker.pull !== 'always') return;
      if (docker.pull === 'never') throw new Error(`The image ${image} isn’t on this server. Ship it with deploy/release.sh; CLOUD_IMAGE_PULL is never, so it isn’t pulled.`);
      const res = await client.stream('POST', '/images/create', { query: { fromImage: image }, timeout: 900_000 });
      // progress arrives as JSON lines, and a failure can arrive mid-stream with status 200
      let rest = '';
      let failure = null;
      for await (const chunk of res) {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop();
        for (const line of lines) {
          try {
            failure = JSON.parse(line).error ?? failure;
          } catch {}
        }
      }
      if (failure) throw new Error(`Pulling ${image} failed: ${failure}`);
    },

    async create(spec) {
      const labels = { 'org.nonos.cloud.workspace': spec.id };
      try {
        // an internal network has no route out of the host; Caddy, attached to every workspace
        // network, is then the only way in and the only way to the chain. An isolated one (a
        // restore drill) doesn't even get Caddy. IPv4 only, whatever the daemon's defaults: Docker
        // then turns IPv6 off on the workspace's interface, so it has no IPv6 address or route.
        const internal = spec.isolated || app.egress === 'rpc-only';
        await client.json('POST', '/networks/create', { body: { Name: containerName(spec.id), Driver: 'bridge', Internal: internal, EnableIPv6: false, Labels: labels } });
      } catch (err) {
        if (err.status !== 409) throw err;
      }
      if (!spec.isolated) await attachProxy(spec.id);
      await client.json('POST', '/volumes/create', { body: { Name: spec.volume, Driver: 'local', Labels: labels } });
      await ownVolume(client, spec);
      await client.json('POST', '/containers/create', { query: { name: containerName(spec.id) }, body: containerBody(spec, settings) });
    },

    attachProxy,

    // Recreating the Caddy container (to update it, say) drops it from every workspace network.
    // One inspect shows which are missing; only those are reconnected.
    async ensureProxy(ids) {
      if (!caddy.container) return 0;
      const info = await client.quiet('GET', `/containers/${encodeURIComponent(caddy.container)}/json`);
      if (!info) return 0;
      const joined = new Set(Object.keys(info.NetworkSettings?.Networks ?? {}));
      let attached = 0;
      for (const id of ids.filter((id) => !joined.has(containerName(id)))) {
        try {
          await attachProxy(id);
          attached++;
        } catch (err) {
          if (err.status !== 404) throw err;
        }
      }
      return attached;
    },

    start: (id) => client.json('POST', `/containers/${containerName(id)}/start`),
    stop: (id) => client.quiet('POST', `/containers/${containerName(id)}/stop`, { query: { t: app.stopTimeoutSec }, timeout: (app.stopTimeoutSec + 30) * 1000 }),
    restart: (id) => client.json('POST', `/containers/${containerName(id)}/restart`, { query: { t: app.stopTimeoutSec }, timeout: (app.stopTimeoutSec + 30) * 1000 }),
    remove: (id) => client.quiet('DELETE', `/containers/${containerName(id)}`, { query: { force: 'true' } }),
    removeVolume: (volume) => client.quiet('DELETE', `/volumes/${encodeURIComponent(volume)}`),

    async destroy(id, volumes) {
      await driver.remove(id);
      if (caddy.container) await client.quiet('POST', `/networks/${containerName(id)}/disconnect`, { body: { Container: caddy.container, Force: true } }, [404, 403]);
      await client.quiet('DELETE', `/networks/${containerName(id)}`);
      for (const volume of volumes) await driver.removeVolume(volume);
    },

    async status(id) {
      const info = await client.quiet('GET', `/containers/${containerName(id)}/json`);
      if (!info) return { exists: false, running: false, health: 'none', report: null };
      const health = info.State.Health;
      return {
        exists: true,
        running: Boolean(info.State.Running),
        health: health?.Status ?? 'none',
        report: readHealthReport(health?.Log?.at(-1)?.Output),
        image: info.Config.Image,
        exitCode: info.State.ExitCode,
      };
    },

    // GET a path of the app from inside the workspace, as a visitor on its loopback would.
    async probe(id, path) {
      if (!/^\/[\w/.-]*$/.test(path)) throw new Error('Invalid probe path.');
      try {
        const { exitCode, stdout } = await exec(id, ['wget', '-qO-', '-T', '5', `http://127.0.0.1:${app.port}${path}`]);
        return exitCode === 0 ? JSON.parse(stdout) : null;
      } catch {
        return null;
      }
    },

    async exportData(id) {
      const live = (await driver.status(id)).running;
      if (live) {
        const { exitCode, stderr } = await exec(id, ['node', '--disable-warning=ExperimentalWarning', '-e', SNAPSHOT_SCRIPT]);
        if (exitCode !== 0) throw new Error(`The database snapshot failed: ${stderr.trim().split('\n').at(-1) || `exit ${exitCode}`}`);
      }
      const out = await readArchive(id, mount, dataLayout.exportDecide(live), true);
      if (!out) throw new Error('The workspace has no data folder.');
      if (live) {
        // the copy has done its job; leaving it would keep rows the app has since erased
        out.on('close', () => exec(id, ['rm', '-rf', `${mount}/${snapshotDir}`]).catch((err) => log.warn('snapshot.cleanup_failed', { workspace: id, error: err })));
      }
      return out;
    },

    async importData(id, readable) {
      const tar = rewriteTar({ decide: dataLayout.restoreDecide });
      pipeline(readable, tar, () => {});
      await writeArchive(id, tar);
    },

    // The pre-migration copy of the database, taken while the workspace is stopped so it is
    // exactly what the old version left. It stays inside the workspace's own volume.
    async checkpoint(id) {
      async function* body() {
        yield tarEntry({ name: checkpointDir, type: 'dir' });
        for (const file of [DB, `${DB}-wal`]) {
          const part = await readArchive(id, `${mount}/${file}`, dataLayout.checkpointDecide, false);
          // a missing file is checkpointed as an empty one, so a rollback also clears what the
          // new version created: to SQLite an empty file is a fresh database or an empty WAL
          if (part) yield* part;
          else yield tarEntry({ name: `${checkpointDir}/${file}` });
        }
        yield tarBlocks.end();
      }
      await writeArchive(id, Readable.from(body()));
    },

    async restoreCheckpoint(id) {
      const saved = await readArchive(id, `${mount}/${checkpointDir}`, dataLayout.rollbackDecide, false);
      if (!saved) throw new Error('This workspace has no checkpoint to roll back to.');
      async function* body() {
        yield* saved;
        // shared memory left by the newer version would describe the wrong WAL
        yield tarEntry({ name: `${DB}-shm` });
        yield tarBlocks.end();
      }
      await writeArchive(id, Readable.from(body()));
    },

    async discardCheckpoint(id) {
      const { exitCode } = await exec(id, ['rm', '-rf', `${mount}/${checkpointDir}`]);
      if (exitCode !== 0) throw new Error('Couldn’t remove the checkpoint.');
    },

    // When the workspace's data last changed: the newest modification time of its database
    // files, from the stat header of the archive API (a HEAD request reads nothing inside them),
    // and when its container started, so writes the app makes as it starts can be told apart.
    async lastWrite(id) {
      const info = await client.quiet('GET', `/containers/${containerName(id)}/json`);
      if (!info) return null;
      const mtime = async (path) => {
        try {
          const res = await client.stream('HEAD', archive(id), { query: { path } });
          res.resume();
          const stat = res.headers['x-docker-container-path-stat'];
          return stat ? Date.parse(JSON.parse(Buffer.from(stat, 'base64').toString('utf8')).mtime) || null : null;
        } catch (err) {
          if (err.status === 404) return null;
          throw err;
        }
      };
      const times = (await Promise.all([`${mount}/${DB}`, `${mount}/${DB}-wal`].map(mtime))).filter(Boolean);
      return { at: times.length ? Math.max(...times) : null, startedAt: Date.parse(info.State?.StartedAt) || null };
    },

    // Disk used by each workspace volume, from Docker's own accounting.
    async usage() {
      const df = await client.json('GET', '/system/df', { query: { type: 'volume' }, timeout: 300_000 });
      return new Map((df?.Volumes ?? []).filter((v) => v.UsageData?.Size >= 0).map((v) => [v.Name, v.UsageData.Size]));
    },
  };
  return driver;
}
