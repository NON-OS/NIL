import dockerClient from '../runtime/docker/dockerClient.js';
import readExecOutput from '../runtime/docker/readExecOutput.js';

// Tells Caddy to load the regenerated Caddyfile, by running `caddy reload` inside its container.
// Caddy checks the new configuration before switching, and keeps serving the old one if it is
// rejected. Without CLOUD_CADDY_CONTAINER (Caddy installed on the host) this does nothing, and a
// systemd path unit should run the reload instead (see README).
export default function caddyReloader(config, client = dockerClient(config.docker)) {
  const container = config.caddy.container;
  const file = config.caddy.containerFile;
  return async function reloadCaddy() {
    if (!container) return false;
    const created = await client.json('POST', `/containers/${encodeURIComponent(container)}/exec`, {
      body: { Cmd: ['caddy', 'reload', '--config', file, '--adapter', 'caddyfile'], AttachStdout: true, AttachStderr: true },
    });
    const output = await readExecOutput(await client.stream('POST', `/exec/${created.Id}/start`, { body: { Detach: false, Tty: false } }));
    const info = await client.json('GET', `/exec/${created.Id}/json`);
    if (info.ExitCode !== 0) throw new Error(`Caddy rejected the configuration: ${output.stderr.trim().split('\n').at(-1) ?? 'no details'}`);
    return true;
  };
}
