import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import startVerifier from '../../verifier/startVerifier.js';
import fakeLightClient from './fakeLightClient.js';

const KEY = 'test-verifier-key-0123456789abcdef0123456789';
const MAINNET_GENESIS = 1606824023;
const slotNow = () => Math.floor((Date.now() / 1000 - MAINNET_GENESIS) / 12);

// Nil's real verifier (server/verifier) on a free port, in front of `nodeUrl`, with the fake
// light client above. `checkpointAgeDays` sets how old its checkpoint is. The app under test
// gets testVerifier.KEY as NOX_VERIFIER_KEY.
export default async function testVerifier(nodeUrl, { checkpointAgeDays = 1, maxConcurrent = 64, timeoutMs = 3000 } = {}) {
  const client = fakeLightClient(nodeUrl);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-verifier-'));
  const config = {
    executionRpc: nodeUrl,
    consensusRpc: 'http://127.0.0.1:9',
    network: 'mainnet',
    checkpoint: `0x${'cd'.repeat(32)}`,
    checkpointMaxAgeMs: 14 * 86_400_000,
    key: KEY,
    host: '127.0.0.1',
    port: 0,
    dataDir,
    timeoutMs,
    maxHeadAgeMs: 10 * 60_000,
    retryMs: 60_000,
    maxConcurrent,
    maxBodyBytes: 64 * 1024,
  };
  const verifier = await startVerifier({ config, openClient: async () => client, slotOf: async () => slotNow() - checkpointAgeDays * 7200 });
  // the head check runs once before the verifier calls itself ready
  for (let i = 0; i < 100 && verifier.state.phase !== 'ready' && verifier.state.phase !== 'down'; i++) await new Promise((r) => setTimeout(r, 10));
  return {
    url: `http://127.0.0.1:${verifier.server.address().port}`,
    client,
    state: verifier.state,
    config,
    async close() {
      await verifier.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

testVerifier.KEY = KEY;
