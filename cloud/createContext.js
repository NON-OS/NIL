import path from 'node:path';
import createLog from './lib/createLog.js';
import walletTagger from './lib/walletTagger.js';
import sleep from './lib/sleep.js';
import openDatabase from './db/openDatabase.js';
import createStore from './store/createStore.js';
import createDriver from './runtime/createDriver.js';
import createAlerter from './ops/createAlerter.js';
import createTarget from './backups/targets/createTarget.js';
import backupWorkspace from './backups/backupWorkspace.js';
import createRoutes from './routing/createRoutes.js';
import caddyReloader from './routing/caddyReloader.js';

// Everything an operation needs, built once per process. The server and the CLI share it;
// tests pass their own pieces (a fake driver, an in-memory database, a recording alerter).
export default function createContext(config, overrides = {}) {
  const log = overrides.log ?? createLog({ dir: path.join(config.dataDir, 'logs'), fileBytes: config.logs.fileBytes, files: config.logs.files, stdout: overrides.logToStdout ?? true });
  const ctx = {
    config,
    log,
    store: overrides.store ?? createStore(openDatabase(config.dbFile)),
    driver: overrides.driver ?? createDriver(config, log),
    walletTag: overrides.walletTag ?? walletTagger(config.dataDir),
    alert: overrides.alert ?? createAlerter({ config, log }),
    // waiting goes through the clock so tests can let time pass without waiting for it
    clock: overrides.clock ?? { now: () => Date.now(), sleep },
    pollMs: overrides.pollMs ?? 1000,
    backupTarget: overrides.backupTarget ?? (config.backup.enabled ? createTarget(config.backup.target) : null),
  };
  ctx.backups = ctx.backupTarget ? { workspace: (workspace, kind) => backupWorkspace(ctx, workspace, kind) } : null;
  ctx.routes = overrides.routes ?? createRoutes(ctx, overrides.reloadProxy ?? caddyReloader(config));
  return ctx;
}
