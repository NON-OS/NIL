import dataLayout from '../dataLayout.js';

const ns = (seconds) => Math.round(seconds * 1e9);

// The Docker container definition for one workspace. Each one gets: its own network namespace
// on its own bridge network, a read-only root filesystem with a small no-exec /tmp, no Linux
// capabilities, no-new-privileges, an init process, hard CPU, memory and process limits with no
// swap, rotated logs, and a health check against the app's own /healthz.
export default function containerBody(spec, settings) {
  const network = `nil-${spec.id}`;
  return {
    Image: spec.image,
    User: spec.user,
    Env: Object.entries(spec.env).map(([key, value]) => `${key}=${value}`),
    Labels: { 'org.nonos.cloud.role': 'workspace', 'org.nonos.cloud.workspace': spec.id },
    StopTimeout: settings.stopTimeoutSec,
    Healthcheck: {
      Test: ['CMD', 'wget', '-qO-', '-T', '5', `http://127.0.0.1:${settings.appPort}/healthz`],
      Interval: ns(settings.healthIntervalSec),
      Timeout: ns(6),
      Retries: 3,
      // checked every 2 seconds while starting, so a new workspace is ready as soon as it can be
      StartPeriod: ns(settings.startTimeoutSec),
      StartInterval: ns(2),
    },
    HostConfig: {
      Mounts: [{ Type: 'volume', Source: spec.volume, Target: dataLayout.mount }],
      NetworkMode: network,
      ReadonlyRootfs: true,
      Tmpfs: { '/tmp': `rw,noexec,nosuid,nodev,size=${settings.tmpfsMb}m` },
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      Init: true,
      IpcMode: 'private',
      NanoCpus: Math.round(spec.limits.cpus * 1e9),
      Memory: spec.limits.memoryBytes,
      MemorySwap: spec.limits.memoryBytes,
      PidsLimit: spec.limits.pids,
      RestartPolicy: { Name: 'unless-stopped' },
      LogConfig: { Type: 'local', Config: { 'max-size': `${settings.logMb}m`, 'max-file': String(settings.logFiles) } },
    },
    NetworkingConfig: { EndpointsConfig: { [network]: {} } },
  };
}
