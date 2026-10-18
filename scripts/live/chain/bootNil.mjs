import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import SETUP_TOKEN from './setupToken.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function freePort() {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => probe.once('listening', r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  return port;
}

// Starts Nil from this checkout, with a fresh data folder, against the given node. Background
// jobs run every few seconds instead of every minute so a check doesn't wait on them. The
// server's log goes to a file next to the data, kept after the run for reading.
export default async function bootNil({ rpcUrl, env = {}, port = null, dataDir: keep = null } = {}) {
  // a run that picks up where an earlier one stopped keeps its data folder
  const dataDir = keep ?? fs.mkdtempSync(path.join(os.tmpdir(), 'nil-live-'));
  const listen = port ?? (await freePort());
  const base = `http://localhost:${listen}`;
  const logFile = path.join(dataDir, 'server.log');
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(listen),
      HOST: '127.0.0.1',
      APP_URL: base,
      DATA_DIR: dataDir,
      SETUP_TOKEN,
      NOX_RPC_URL: rpcUrl,
      JOB_PAYMENTS_SECONDS: '3',
      JOB_VOTES_SECONDS: '3',
      JOB_TRANSFER_FEE_SECONDS: '3',
      STEALTH_BALANCE_SPREAD_SECONDS: '1',
      PUSH_NOTIFICATIONS: 'off',
      ...env,
    },
    stdio: ['ignore', out, out],
  });
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(`Nil exited with code ${child.exitCode}; see ${logFile}`);
    try {
      if ((await fetch(`${base}/healthz`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    dataDir,
    logFile,
    log: () => fs.readFileSync(logFile, 'utf8'),
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill('SIGTERM');
    }),
  };
}
