// Starts Helios from one checkpoint and waits until it has followed the beacon chain to its
// head. Helios is loaded only here, so nothing else that imports the verifier pays for its WASM.
// Its in-memory store ("config") is used rather than a browser's localStorage: the checkpoint it
// reaches is kept on disk by the verifier itself (checkpointFile.js).
export default async function openLightClient(config, checkpoint) {
  const { createHeliosProvider } = await import('@a16z/helios');
  const client = await createHeliosProvider(
    { executionRpc: config.executionRpc, consensusRpc: config.consensusRpc, network: config.network, checkpoint, dbType: 'config' },
    'ethereum',
  );
  try {
    await client.waitSynced();
  } catch (err) {
    await client.shutdown().catch(() => {});
    throw err;
  }
  return client;
}
