import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { once } from 'node:events';
import SETUP_TOKEN from './setupToken.js';

// The server needs its own address (APP_URL) before it starts, so pick the port first.
async function freePort() {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

// Boots a private NONOS instance for one test file. Must run before anything imports the
// server, because configuration is read from the environment at import time.
export default async function startServer({ chain, env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
  const port = await freePort();
  process.env.DATA_DIR = dataDir;
  process.env.SETUP_TOKEN = SETUP_TOKEN;
  process.env.APP_URL = `http://127.0.0.1:${port}`;
  Object.assign(process.env, env);
  if (chain) {
    chain.server.listen(0);
    await once(chain.server, 'listening');
    process.env.NOX_RPC_URL = `http://127.0.0.1:${chain.server.address().port}`;
  } else {
    // keeps tests that don't need a chain from ever calling a real Ethereum node
    process.env.NOX_RPC_URL = 'off';
  }
  const { default: migrate } = await import('../../db/migrate.js');
  const { default: createApp } = await import('../../app.js');
  const { default: attachRealtime } = await import('../../realtime/attachRealtime.js');
  migrate();
  const server = createApp().listen(port, '127.0.0.1');
  // A test can keep the event loop busy for seconds (proofs, curve math) between two requests
  // from the same client. With the default five-second keep-alive the server may drop the idle
  // connection just as the client reuses it, and the fetch fails. close() still ends idle ones.
  server.keepAliveTimeout = 10 * 60_000;
  attachRealtime(server);
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${port}`,
    dataDir,
    close() {
      server.close();
      chain?.server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
