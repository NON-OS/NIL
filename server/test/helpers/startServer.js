import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

// Boots a private NONOS instance for one test file. Must run before anything imports the
// server, because configuration is read from the environment at import time.
export default async function startServer({ chain } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-test-'));
  process.env.DATA_DIR = dataDir;
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
  migrate();
  const server = createApp().listen(0);
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    dataDir,
    close() {
      server.close();
      chain?.server.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
