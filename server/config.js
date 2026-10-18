import path from 'node:path';
import envNumber from './lib/envNumber.js';
import configWarning from './lib/configWarning.js';
import log from './lib/log.js';
import units from './config/units.js';
import appSite from './config/appSite.js';
import origins from './config/origins.js';
import trustProxy from './config/trustProxy.js';
import setupToken from './config/setupToken.js';
import nox from './config/nox.js';
import rewards from './config/rewardTokens.js';
import plan from './config/plan.js';
import stealth from './config/stealth.js';
import pools from './config/privacyPools.js';
import power from './config/power.js';
import billing from './config/billing.js';
import finality from './config/finality.js';
import payments from './config/payments.js';
import holders from './config/holders.js';
import semaphore from './config/semaphore.js';
import signIn from './config/signIn.js';
import jobs from './config/jobs.js';
import purge from './config/purge.js';
import keep from './config/keep.js';
import tasks from './config/tasks.js';
import push from './config/push.js';
import due from './config/due.js';
import calendarFeeds from './config/calendarFeeds.js';
import bountyBoard from './config/bountyBoard.js';
import uploads from './config/uploads.js';
import ai from './config/ai.js';
import aiCredits from './config/aiCredits.js';
import agents from './config/agents.js';
import verification from './config/verification.js';
import PUBLIC_NODE from './config/publicNode.js';

// Every setting is optional except APP_URL, and NOX_RPC_URL on a server reached over the network.
// An empty value counts as unset. A value that is set but can't be used gets the default, or
// turns its feature off, and says so in a warning at startup. Each group of settings is read in
// its own file under config/; this one puts them together and runs the checks that need all of
// them.
const env = process.env;
const production = env.NODE_ENV === 'production';
const { SECOND, MB } = units;

// log.js reads LOG_FORMAT itself, since it has to work before this file has run. This only
// catches a typo.
if (!['', 'text', 'json'].includes((env.LOG_FORMAT ?? '').trim())) configWarning('LOG_FORMAT is neither "text" nor "json". Using text.');

const config = Object.freeze({
  production,
  port: envNumber('PORT', 3000, { max: 65535 }),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || null,
  // after a checkpoint SQLite cuts the write-ahead log back to this size instead of keeping its peak
  dbJournalLimitBytes: envNumber('DB_JOURNAL_LIMIT_MB', 64, { min: 1 }) * MB,
  // how long a write waits for another connection (a backup reading, say) before giving up
  dbBusyTimeoutMs: envNumber('DB_BUSY_TIMEOUT_MS', 5000, { min: 1 }),
  // how long folding the write-ahead log in waits for readers; the server waits with it
  dbCheckpointWaitMs: envNumber('DB_CHECKPOINT_WAIT_MS', 250, { min: 1 }),
  // prepared statements kept for reuse; queries built from a request's fields come in many shapes
  dbStatementCache: envNumber('DB_STATEMENT_CACHE', 1000, { min: 10 }),
  trustProxy,
  appUrl: appSite.origin,
  sourceUrl: env.SOURCE_URL || null,
  allowedOrigins: origins,
  setupToken,
  shutdownTimeoutMs: envNumber('SHUTDOWN_TIMEOUT_SECONDS', 20, { min: 1 }) * SECOND,
  maxJsonBytes: envNumber('MAX_JSON_KB', 1024, { min: 1 }) * 1024,
  // how deep request JSON may nest; real requests stay far below this
  maxJsonDepth: envNumber('MAX_JSON_DEPTH', 64, { min: 8 }),
  maxUploadBytes: envNumber('MAX_UPLOAD_MB', 25, { min: 1 }) * MB,
  uploads,
  maxCapsuleBytes: envNumber('MAX_CAPSULE_MB', 4096, { min: 1 }) * MB,
  sessionDays: envNumber('SESSION_DAYS', 30, { min: 1 }),
  // messages one live connection may send a minute; the app sends a few, a flood gets cut off
  realtimeMessagesPerMinute: envNumber('REALTIME_MESSAGES_PER_MINUTE', 600, { min: 10 }),
  trashDays: envNumber('TRASH_DAYS', 30),
  readNotificationDays: envNumber('NOTIFICATION_DAYS', 90),
  usedInviteDays: envNumber('USED_INVITE_DAYS', 30),
  jobs,
  purge,
  keep,
  nox,
  rewards,
  plan,
  stealth,
  pools,
  semaphore,
  tasks,
  power,
  push,
  due,
  calendarFeeds,
  bountyBoard,
  signIn,
  billing,
  finality,
  payments,
  holders,
  ai,
  aiCredits,
  agents,
  verification,
});

// Settings that work but are wrong for a public server. Only production gets these, so a
// laptop running `npm run dev` stays quiet.
if (production) {
  if (config.appUrl.startsWith('https://') && !config.trustProxy) configWarning('APP_URL is https, but TRUST_PROXY is empty. Behind a TLS proxy, cookies lose the Secure flag, HSTS isn’t sent and rate limits see the proxy’s address. Set TRUST_PROXY=1.');
  if (nox.enabled && env.NOX_RPC_URL === PUBLIC_NODE) configWarning(`NOX_RPC_URL is the default public node (${PUBLIC_NODE}), which sees every address and transaction this server looks up, and this server’s IP. Point it at your own node or a provider you trust, or set it to "off".`);
}

const STRICT = ['1', 'true'].includes((env.STRICT_CONFIG ?? '').trim());
if (STRICT && configWarning.count()) {
  const n = configWarning.count();
  log.error('config', `STRICT_CONFIG is on, so the server won’t start until ${n === 1 ? 'the warning above is' : `the ${n} warnings above are`} fixed.`);
  process.exit(1);
}

export default config;
