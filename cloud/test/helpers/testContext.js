import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import loadConfig from '../../config/loadConfig.js';
import createContext from '../../createContext.js';
import openDatabase from '../../db/openDatabase.js';
import createStore from '../../store/createStore.js';
import backupKeys from '../../backups/backupKeys.js';
import fakeDriver from './fakeDriver.js';
import baseEnv from './baseEnv.js';

const silent = { info() {}, warn() {}, error() {} };

// A control plane wired to a fake runtime, an in-memory database and recorders for alerts and
// Caddy reloads. With `backups: true` it also gets a real file backup target and a key pair.
export default function testContext({ env = {}, driver = fakeDriver(), backups = false, now } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-cloud-test-'));
  const extra = {};
  let secretKey = null;
  if (backups) {
    const keys = backupKeys.generate();
    secretKey = keys.secretKey;
    fs.mkdirSync(path.join(dataDir, 'backups'));
    fs.writeFileSync(path.join(dataDir, 'backups', '.nil-backup-target'), '');
    Object.assign(extra, { CLOUD_BACKUP_TARGET: `file://${path.join(dataDir, 'backups')}`, CLOUD_BACKUP_RECIPIENTS: keys.publicKey });
  }
  const { config, errors } = loadConfig({ ...baseEnv, CLOUD_DATA_DIR: dataDir, ...extra, ...env });
  if (errors.length) throw new Error(errors.join('\n'));
  const alerts = [];
  const reloads = [];
  // waiting for health passes virtual time instantly
  let virtual = 0;
  const clock = { now: () => virtual, sleep: async (ms) => void (virtual += ms) };
  const ctx = createContext(config, {
    log: silent,
    store: createStore(openDatabase(':memory:'), now),
    driver,
    walletTag: (address) => (address ? `w-${String(address).toLowerCase().slice(2, 12)}` : null),
    alert: async (event, details = {}) => {
      alerts.push({ event, ...details });
      return true;
    },
    clock,
    pollMs: 1000,
    reloadProxy: async () => {
      reloads.push(true);
      return true;
    },
  });
  return Object.assign(ctx, { alerts, reloads, dataDir, secretKey });
}
