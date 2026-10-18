import dockerDriver from './docker/dockerDriver.js';

// Picks the runtime that runs workspaces. Every runtime implements the same small interface,
// in terms of workspaces rather than containers, so another one (Podman, Firecracker, a remote
// host) can be added without touching provisioning, backups or routing:
//
//   hasImage(image)             whether the image is on this server already
//   ensureImage(image)          make the app image available locally
//   create(spec)                isolated network, data volume and stopped workload for a spec
//                               (see workspaceSpec.js); safe to call when parts already exist
//   start(id) stop(id) restart(id)
//   remove(id)                  remove the workload, keep its volume
//   destroy(id, volumes)        remove the workload, its network and the given volumes
//   removeVolume(volume)
//   status(id)                  { exists, running, health, report } where health is one of
//                               healthy, unhealthy, starting, none
//   probe(id, path)             GET an app path from inside the workspace, parsed JSON or null
//   exportData(id)              readable tar of the data directory, consistent even while
//                               running: the live database is replaced by a snapshot
//   importData(id, readable)    extract such a tar into the (stopped) workspace's volume
//   checkpoint(id)              pre-migration copy of the database, workspace stopped
//   restoreCheckpoint(id)       put that copy back, workspace stopped
//   discardCheckpoint(id)       remove it, workspace running
//   attachProxy(id)             make sure the reverse proxy can reach the workspace
//   ensureProxy(ids)            the same for many workspaces, cheaply; returns how many it fixed
//   upstream(id)                host:port the reverse proxy forwards to
//   usage()                     Map of volume name to bytes used
export default function createDriver(config, log) {
  if (config.runtime === 'docker') return dockerDriver({ config, log });
  throw new Error(`Unknown runtime: ${config.runtime}`);
}
