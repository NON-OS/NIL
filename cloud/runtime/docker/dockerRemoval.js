import DockerError from './DockerError.js';
import sleep from '../../lib/sleep.js';

// Taking a workspace off the host for good, for dockerDriver. Docker answers 409 for a moment
// while what it removes is still in use: a container whose forced removal is still finishing,
// or a helper that hasn't let go of the volume. Those calls are retried with a doubling wait,
// CLOUD_DOCKER_REMOVE_TRIES times from CLOUD_DOCKER_REMOVE_WAIT_MS; anything else fails at once.
export default function dockerRemoval({ client, docker, joiners, containerName }) {
  async function patiently(fn) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (err.status !== 409 || attempt >= docker.removeTries) throw err;
        await sleep(docker.removeWaitMs * 2 ** (attempt - 1));
      }
    }
  }

  // Gone means Docker no longer knows the container, not just that it accepted the removal.
  async function removeContainer(name) {
    const path = `/containers/${encodeURIComponent(name)}`;
    await patiently(() => client.quiet('DELETE', path, { query: { force: 'true' } }));
    await patiently(async () => {
      if (await client.quiet('GET', `${path}/json`)) throw new DockerError(409, 'still being removed', path);
    });
  }

  // Every container that carries the workspace's label: its own and any helper left behind.
  async function labelled(id) {
    const list = await client.json('GET', '/containers/json', { query: { all: 'true', filters: JSON.stringify({ label: [`org.nonos.cloud.workspace=${id}`] }) } });
    return (list ?? []).map((c) => String(c.Names?.[0] ?? c.Id).replace(/^\//, ''));
  }

  // What of a workspace is still on the host: containers, its network, the given volumes.
  async function leftovers(id, volumes) {
    const containers = new Set(await labelled(id));
    if (await client.quiet('GET', `/containers/${containerName(id)}/json`)) containers.add(containerName(id));
    const networks = (await client.quiet('GET', `/networks/${encodeURIComponent(containerName(id))}`)) ? [containerName(id)] : [];
    const kept = [];
    for (const volume of volumes) if (await client.quiet('GET', `/volumes/${encodeURIComponent(volume)}`)) kept.push(volume);
    return { containers: [...containers], networks, volumes: kept };
  }

  // Each step runs even when an earlier one failed, so as much as possible goes. Whatever is
  // still there afterwards is named on the error, with the commands that remove it by hand.
  async function destroy(id, volumes) {
    const network = containerName(id);
    const failures = [];
    const step = async (fn) => {
      try {
        await fn();
      } catch (err) {
        failures.push(err.message);
      }
    };
    await step(() => removeContainer(containerName(id)));
    await step(async () => {
      for (const name of await labelled(id)) await removeContainer(name);
    });
    for (const container of joiners) await step(() => client.quiet('POST', `/networks/${network}/disconnect`, { body: { Container: container, Force: true } }, [404, 403]));
    await step(() => patiently(() => client.quiet('DELETE', `/networks/${encodeURIComponent(network)}`)));
    for (const volume of volumes) await step(() => patiently(() => client.quiet('DELETE', `/volumes/${encodeURIComponent(volume)}`)));
    if (!failures.length) return;
    const left = await leftovers(id, volumes).catch(() => ({ containers: [containerName(id)], networks: [network], volumes: [...volumes] }));
    const commands = [...left.containers.map((c) => `docker rm -f ${c}`), ...left.networks.map((n) => `docker network rm ${n}`), ...left.volumes.map((v) => `docker volume rm ${v}`)];
    if (!commands.length) return;
    throw Object.assign(new Error(`Removing workspace ${id} left ${commands.length === 1 ? 'something' : 'things'} behind: ${failures.join('; ')}`), { leftovers: { ...left, commands } });
  }

  return { destroy, leftovers };
}
