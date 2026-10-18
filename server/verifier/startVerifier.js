import { once } from 'node:events';
import log from '../lib/log.js';
import logLimited from '../lib/logLimited.js';
import beaconNetworks from './beaconNetworks.js';
import checkpointFile from './checkpointFile.js';
import checkpointSlot from './checkpointSlot.js';
import chooseCheckpoint from './chooseCheckpoint.js';
import openLightClient from './openLightClient.js';
import relayCall from './relayCall.js';
import verifierServer from './verifierServer.js';
import watchHead from './watchHead.js';

// Starts the verifier: its HTTP side at once, so the app hears why it can't verify yet rather
// than nothing, then the light client from the newest checkpoint young enough to trust. A
// checkpoint that is too old, or a consensus node that doesn't answer, is retried every
// VERIFIER_RETRY_SECONDS; until then every request that needs proof is refused with the reason.
export default async function startVerifier({ config, openClient = openLightClient, slotOf, relay = relayCall(config) }) {
  const state = { phase: 'starting', reason: 'syncing', client: null, headAt: 0, inFlight: 0, checkpointAgeMs: undefined };
  const readSlot = slotOf ?? ((checkpoint) => checkpointSlot(config.consensusRpc, checkpoint, { timeoutMs: config.timeoutMs }));
  const server = verifierServer({ config, state, relay });
  let watcher = null;
  let retry = null;
  let closed = false;

  async function boot() {
    try {
      const chosen = await chooseCheckpoint({
        candidates: [config.checkpoint, checkpointFile.read(config.dataDir)],
        slotOf: readSlot,
        genesisTime: beaconNetworks[config.network].genesisTime,
        maxAgeMs: config.checkpointMaxAgeMs,
      });
      state.checkpointAgeMs = chosen.ageMs;
      state.phase = 'syncing';
      const client = await openClient(config, chosen.checkpoint);
      if (closed) return client.shutdown();
      state.client = client;
      watcher = watchHead(state, config);
      await watcher.first;
      state.phase = 'ready';
      state.reason = null;
      log.info('verifier', `The light client is in step with ${config.network}, from a checkpoint ${Math.floor(chosen.ageMs / 3_600_000)} hours old.`);
    } catch (err) {
      state.phase = 'down';
      state.reason = err.reason ?? 'syncing';
      logLimited(`verifier:boot:${state.reason}`, 'error', 'verifier', `The light client couldn’t start, so nothing is answered with proof. Trying again in ${config.retryMs / 1000} seconds.`, err);
      if (!closed) retry = setTimeout(boot, config.retryMs);
    }
  }

  server.listen(config.port, config.host);
  await once(server, 'listening');
  boot();
  return {
    server,
    state,
    async close() {
      closed = true;
      clearTimeout(retry);
      watcher?.stop();
      const closing = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closing;
      await state.client?.shutdown().catch(() => {});
    },
  };
}
