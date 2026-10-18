import dataLayout from '../dataLayout.js';

// A new volume starts out owned by the image's own user (uid 1000), and so do the files of a
// workspace created before each had its own uid. Before the workspace's container is created, a
// short-lived helper from the same image hands the whole volume to the workspace's uid. It runs
// as root with only the two capabilities chown needs (CHOWN, and DAC_READ_SEARCH to enter
// private folders), no network, a read-only root and nothing but the volume mounted. Symbolic
// links are changed themselves, never followed.
export default async function ownVolume(client, spec) {
  const name = `nil-${spec.id}-owner`;
  await client.quiet('DELETE', `/containers/${name}`, { query: { force: 'true' } });
  await client.json('POST', '/containers/create', {
    query: { name },
    body: {
      Image: spec.image,
      User: '0:0',
      Entrypoint: ['chown', '-hR', spec.user, dataLayout.mount],
      Cmd: [],
      Labels: { 'org.nonos.cloud.role': 'helper', 'org.nonos.cloud.workspace': spec.id },
      NetworkDisabled: true,
      HostConfig: {
        Mounts: [{ Type: 'volume', Source: spec.volume, Target: dataLayout.mount }],
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'DAC_READ_SEARCH'],
        SecurityOpt: ['no-new-privileges:true'],
        PidsLimit: 16,
        Memory: 128 * 1024 ** 2,
        MemorySwap: 128 * 1024 ** 2,
        LogConfig: { Type: 'none', Config: {} },
      },
    },
  });
  try {
    await client.json('POST', `/containers/${name}/start`);
    // a large volume can take a while; nothing is sent until chown is done
    const result = await client.json('POST', `/containers/${name}/wait`, { timeout: 1_800_000 });
    if (result?.StatusCode !== 0) throw new Error(`Handing the data volume to the workspace’s own user failed (exit code ${result?.StatusCode ?? 'unknown'}).`);
  } finally {
    await client.quiet('DELETE', `/containers/${name}`, { query: { force: 'true' } });
  }
}
