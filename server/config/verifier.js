import path from 'node:path';
import envNumber from '../lib/envNumber.js';
import envUrl from './envUrl.js';
import refuseToStart from '../lib/refuseToStart.js';
import units from './units.js';
import beaconNetworks from '../verifier/beaconNetworks.js';

const DAY = 24 * units.HOUR;
const ROOT = /^0x[0-9a-f]{64}$/;
const env = process.env;

function required(name, value, why) {
  if (!value) refuseToStart(`${name} is required: ${why}`);
  return value;
}

function network(value) {
  const name = (value ?? '').trim() || 'mainnet';
  if (!beaconNetworks[name]) refuseToStart(`VERIFIER_NETWORK=${name} isn’t one the verifier knows (${Object.keys(beaconNetworks).join(', ')}).`);
  return name;
}

function checkpoint(value) {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw && !ROOT.test(raw)) refuseToStart('VERIFIER_CHECKPOINT isn’t a block root (0x followed by 64 hex characters).');
  return raw || null;
}

function key(value) {
  const raw = (value ?? '').trim();
  if (raw.length < 32) refuseToStart('VERIFIER_KEY must be at least 32 characters, the same value the app has as NOX_VERIFIER_KEY. Make one with: openssl rand -hex 32');
  return raw;
}

// Settings for Nil's verifier (server/verifier), the light client that checks what an Ethereum
// node says before the app acts on it. Read only by the verifier's own process, never by the app.
export default Object.freeze({
  executionRpc: required('VERIFIER_EXECUTION_RPC', envUrl('VERIFIER_EXECUTION_RPC'), 'the Ethereum execution node whose answers the verifier checks.'),
  consensusRpc: required('VERIFIER_CONSENSUS_RPC', envUrl('VERIFIER_CONSENSUS_RPC'), 'a beacon node API with the light-client endpoints, such as Lighthouse with --http.'),
  network: network(env.VERIFIER_NETWORK),
  checkpoint: checkpoint(env.VERIFIER_CHECKPOINT),
  // the weak-subjectivity period on mainnet is about two weeks; older than that, never start
  checkpointMaxAgeMs: envNumber('VERIFIER_CHECKPOINT_MAX_AGE_DAYS', 14, { min: 1, max: 14 }) * DAY,
  key: key(env.VERIFIER_KEY),
  host: env.VERIFIER_HOST || '0.0.0.0',
  port: envNumber('VERIFIER_PORT', 8545, { min: 1, max: 65535 }),
  dataDir: path.resolve(env.VERIFIER_DATA_DIR || path.join(env.DATA_DIR || './data', 'verifier')),
  // under the app's own timeouts (NOX_RPC_TIMEOUT_SECONDS, SIGNIN_CHAIN_TIMEOUT_SECONDS), so the
  // app hears "couldn't verify in time" rather than giving up on silence
  timeoutMs: envNumber('VERIFIER_TIMEOUT_SECONDS', 7, { min: 1, max: 120 }) * units.SECOND,
  // a light client whose newest block is older than this answers nothing until it catches up
  maxHeadAgeMs: envNumber('VERIFIER_MAX_HEAD_AGE_SECONDS', 120, { min: 24 }) * units.SECOND,
  retryMs: envNumber('VERIFIER_RETRY_SECONDS', 30, { min: 5 }) * units.SECOND,
  maxConcurrent: envNumber('VERIFIER_MAX_REQUESTS', 64, { min: 1 }),
  maxBodyBytes: envNumber('VERIFIER_MAX_BODY_KB', 256, { min: 16 }) * 1024,
});
