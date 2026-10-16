import path from 'node:path';
import envReader from './envReader.js';
import parsePlans from './parsePlans.js';
import parseDailyTime from './parseDailyTime.js';
import parseBackupTarget from './parseBackupTarget.js';
import parseEnvFile from './parseEnvFile.js';
import readWordList from './readWordList.js';
import backupKeys from '../backups/backupKeys.js';
import reservedNames from '../names/reservedNames.js';
import blockedWords from '../names/blockedWords.js';

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UPSTREAM = /^[a-z0-9.-]+:\d{1,5}$/;
// Sized for the recommended server (see README): enough for Nil's server with headroom for the
// proof verifier, and small enough that a busy or broken workspace can't starve its neighbours.
const DEFAULT_PLANS = 'standard:cpus=1,memory=768m,pids=256,disk=5g;pro:cpus=2,memory=1536m,pids=512,disk=50g';

function hostname(read, name, value) {
  const host = (value ?? '').toLowerCase();
  if (host && !HOSTNAME.test(host)) read.fail(`${name} must be a domain name such as nil.example.`);
  return host || null;
}

// Every setting for the control plane, read once from the environment. Nothing here reads a
// global: tests and the CLI pass their own environment.
export default function loadConfig(env = process.env) {
  const read = envReader(env);

  const domain = hostname(read, 'CLOUD_DOMAIN', read.required('CLOUD_DOMAIN', 'Workspaces live at <name>.CLOUD_DOMAIN, for example nil.example.'));
  const signupHost = hostname(read, 'CLOUD_SIGNUP_HOST', read.text('CLOUD_SIGNUP_HOST', domain));
  const port = read.number('CLOUD_PORT', 8080, { min: 1, max: 65535 });
  const internalPort = read.number('CLOUD_INTERNAL_PORT', 8081, { min: 1, max: 65535 });
  if (port === internalPort) read.fail('CLOUD_PORT and CLOUD_INTERNAL_PORT must differ: the internal port must never be public.');
  const dataDir = path.resolve(read.text('CLOUD_DATA_DIR', 'data'));

  const image = read.required('CLOUD_APP_IMAGE', 'Set it to the Nil image every workspace runs, for example nonos/nil:3.0.0.');
  const user = read.text('CLOUD_APP_USER', '1000:1000');
  if (!/^\d+:\d+$/.test(user)) read.fail('CLOUD_APP_USER must be uid:gid, for example 1000:1000.');

  const treasury = read.text('CLOUD_PLAN_TREASURY');
  if (treasury && !ADDRESS.test(treasury)) read.fail('CLOUD_PLAN_TREASURY must be an Ethereum address (0x and 40 hex characters).');
  if (!treasury) read.warn('CLOUD_PLAN_TREASURY is not set, so hosted workspaces run in community mode: every tool is unlocked and nothing is billed.');

  const rpcUrl = read.raw('CLOUD_RPC_URL') === 'off' ? 'off' : read.url('CLOUD_RPC_URL', { protocols: ['https:', 'http:'] });
  if (!rpcUrl) read.fail('CLOUD_RPC_URL is not set. Point it at your own Ethereum node (see README), or set it to off to turn on-chain features and billing off.');
  if (rpcUrl === 'off' && treasury) read.warn('CLOUD_RPC_URL is off, so workspaces can’t check payments and run in community mode despite CLOUD_PLAN_TREASURY.');
  const egress = read.oneOf('CLOUD_EGRESS', ['rpc-only', 'open'], 'rpc-only');

  const sourceUrl = read.url('CLOUD_SOURCE_URL');
  if (!sourceUrl) read.warn('CLOUD_SOURCE_URL is not set. The AGPL asks a hosted service to offer its source; set it to the repository you deploy from.');

  const { plans, problems } = parsePlans(read.text('CLOUD_PLANS', DEFAULT_PLANS));
  problems.forEach((p) => read.fail(`CLOUD_PLANS: ${p}`));
  const defaultPlan = read.text('CLOUD_DEFAULT_PLAN', Object.keys(plans)[0] ?? 'standard');
  if (!plans[defaultPlan]) read.fail(`CLOUD_DEFAULT_PLAN=${defaultPlan} isn’t one of the plans in CLOUD_PLANS.`);

  const caddyContainer = read.text('CLOUD_CADDY_CONTAINER');
  if (egress === 'rpc-only' && rpcUrl && rpcUrl !== 'off' && !caddyContainer) {
    read.fail('CLOUD_EGRESS=rpc-only relays Ethereum requests through Caddy, so CLOUD_CADDY_CONTAINER must name the Caddy container.');
  }
  const tls = read.oneOf('CLOUD_TLS', ['on-demand', 'wildcard'], 'on-demand');
  const dnsProvider = read.text('CLOUD_DNS_PROVIDER');
  if (tls === 'wildcard' && !/^[a-z0-9_]+$/.test(dnsProvider ?? '')) read.fail('CLOUD_TLS=wildcard needs CLOUD_DNS_PROVIDER, the name of the Caddy DNS module (for example hetzner or cloudflare).');
  const controlUpstream = read.text('CLOUD_CADDY_CONTROL', `control:${port}`);
  const askUpstream = read.text('CLOUD_CADDY_ASK', `control:${internalPort}`);
  for (const [name, value] of [['CLOUD_CADDY_CONTROL', controlUpstream], ['CLOUD_CADDY_ASK', askUpstream]]) {
    if (!UPSTREAM.test(value)) read.fail(`${name} must be host:port, for example control:8080.`);
  }

  const recipients = read.list('CLOUD_BACKUP_RECIPIENTS').map((text, i) => {
    const key = backupKeys.parsePublic(text);
    if (!key) read.fail(`CLOUD_BACKUP_RECIPIENTS entry ${i + 1} isn’t a valid backup public key (nilbk-pub-…). Make one with: node cli.js keygen`);
    return key;
  });
  const target = parseBackupTarget(read);
  if (target && !recipients.length) read.fail('CLOUD_BACKUP_TARGET is set but CLOUD_BACKUP_RECIPIENTS is empty: backups are only ever written encrypted.');
  if (recipients.length && !target) read.fail('CLOUD_BACKUP_RECIPIENTS is set but CLOUD_BACKUP_TARGET is empty.');
  if (!target && !recipients.length) read.warn('Backups are off: set CLOUD_BACKUP_TARGET and CLOUD_BACKUP_RECIPIENTS.');
  const backupTime = parseDailyTime(read.text('CLOUD_BACKUP_TIME', '03:15'));
  if (backupTime === undefined) read.fail('CLOUD_BACKUP_TIME must be HH:MM in UTC, or off.');

  const nameMin = read.number('CLOUD_NAME_MIN', 3, { min: 1, max: 63 });
  const nameMax = read.number('CLOUD_NAME_MAX', 32, { min: nameMin, max: 63 });

  const config = {
    domain,
    signupHost,
    listen: Object.freeze({ host: read.text('CLOUD_HOST', '0.0.0.0'), port, internalPort }),
    trustProxy: read.number('CLOUD_TRUST_PROXY', 0, { max: 10 }),
    dataDir,
    dbFile: path.join(dataDir, 'control.db'),
    contact: read.text('CLOUD_CONTACT'),
    links: Object.freeze({
      source: sourceUrl,
      terms: read.url('CLOUD_TERMS_URL'),
      privacy: read.url('CLOUD_PRIVACY_URL'),
      imprint: read.url('CLOUD_IMPRINT_URL'),
    }),
    runtime: read.oneOf('CLOUD_RUNTIME', ['docker'], 'docker'),
    docker: Object.freeze({
      socket: read.text('CLOUD_DOCKER_SOCKET', '/var/run/docker.sock'),
      apiVersion: /^1\.\d{2}$/.test(read.raw('CLOUD_DOCKER_API')) ? read.raw('CLOUD_DOCKER_API') : '1.44',
      pull: read.oneOf('CLOUD_IMAGE_PULL', ['missing', 'never', 'always'], 'missing'),
    }),
    app: Object.freeze({
      image,
      user,
      port: read.number('CLOUD_APP_PORT', 3000, { min: 1, max: 65535 }),
      treasury: treasury ? treasury.toLowerCase() : null,
      rpcUrl,
      egress,
      extraEnv: parseEnvFile(read.text('CLOUD_APP_ENV_FILE'), read),
      tmpfsMb: read.number('CLOUD_APP_TMPFS_MB', 64, { min: 8, max: 4096 }),
      logMb: read.number('CLOUD_APP_LOG_MB', 10, { min: 1, max: 1024 }),
      logFiles: read.number('CLOUD_APP_LOG_FILES', 3, { min: 1, max: 20 }),
      healthIntervalSec: read.number('CLOUD_APP_HEALTH_INTERVAL_SEC', 30, { min: 5, max: 600 }),
      startTimeoutSec: read.number('CLOUD_START_TIMEOUT_SEC', 120, { min: 10, max: 3600 }),
      stopTimeoutSec: read.number('CLOUD_STOP_TIMEOUT_SEC', 15, { min: 1, max: 300 }),
    }),
    plans,
    defaultPlan,
    caddy: Object.freeze({
      file: path.resolve(read.text('CLOUD_CADDYFILE', path.join(dataDir, 'caddy', 'Caddyfile'))),
      // the same file as Caddy sees it, inside its own container
      containerFile: read.text('CLOUD_CADDYFILE_IN_CADDY', '/etc/caddy/Caddyfile'),
      container: caddyContainer,
      tls,
      dnsProvider,
      dnsTokenEnv: read.text('CLOUD_DNS_TOKEN_ENV', 'DNS_API_TOKEN'),
      acmeEmail: read.text('CLOUD_ACME_EMAIL'),
      controlUpstream,
      askUpstream,
      rpcRelayPort: read.number('CLOUD_RPC_RELAY_PORT', 8545, { min: 1, max: 65535 }),
      streamCloseDelayMin: read.number('CLOUD_STREAM_CLOSE_DELAY_MIN', 5, { max: 120 }),
    }),
    signup: Object.freeze({
      open: read.oneOf('CLOUD_SIGNUP', ['open', 'closed'], 'open') === 'open',
      maxWorkspaces: read.number('CLOUD_MAX_WORKSPACES', 300, { min: 1 }),
      perWallet: read.number('CLOUD_MAX_PER_WALLET', 3, { min: 1 }),
      perWalletPerDay: read.number('CLOUD_SIGNUPS_PER_WALLET_PER_DAY', 2, { min: 1 }),
      perIpPerDay: read.number('CLOUD_SIGNUPS_PER_IP_PER_DAY', 3, { min: 1 }),
      perHour: read.number('CLOUD_SIGNUPS_PER_HOUR', 30, { min: 1 }),
      challengesPerIp: read.number('CLOUD_CHALLENGES_PER_IP', 20, { min: 1 }),
      nameChecksPerIp: read.number('CLOUD_NAME_CHECKS_PER_IP', 60, { min: 1 }),
      powBits: read.number('CLOUD_POW_BITS', 16, { max: 24 }),
      nameMin,
      nameMax,
      reserved: Object.freeze(new Set([...reservedNames, ...read.list('CLOUD_RESERVED_NAMES').map((n) => n.toLowerCase())])),
      blocked: Object.freeze([...blockedWords, ...readWordList(read.text('CLOUD_BLOCKLIST_FILE'), read)]),
      quarantineDays: read.number('CLOUD_NAME_QUARANTINE_DAYS', 90),
      unclaimedDays: read.number('CLOUD_UNCLAIMED_DAYS', 7),
      ticketMinutes: read.number('CLOUD_TICKET_MINUTES', 30, { min: 5, max: 1440 }),
    }),
    lifecycle: Object.freeze({
      deleteGraceDays: read.number('CLOUD_DELETE_GRACE_DAYS', 14),
      upgradeMaxFailures: read.number('CLOUD_UPGRADE_MAX_FAILURES', 1),
      checkpointKeepDays: read.number('CLOUD_CHECKPOINT_KEEP_DAYS', 7),
    }),
    backup: Object.freeze({
      enabled: Boolean(target && recipients.length && recipients.every(Boolean)),
      recipients: Object.freeze(recipients.filter(Boolean)),
      target,
      time: backupTime ?? null,
      keepDays: read.number('CLOUD_BACKUP_KEEP_DAYS', 30, { min: 1 }),
    }),
    health: Object.freeze({
      intervalSec: read.number('CLOUD_HEALTH_INTERVAL_SEC', 60, { min: 10 }),
      failures: read.number('CLOUD_HEALTH_FAILURES', 3, { min: 1 }),
      maxRestartsPerHour: read.number('CLOUD_MAX_RESTARTS_PER_HOUR', 3, { min: 1 }),
      diskFreeAlertPercent: read.number('CLOUD_DISK_FREE_ALERT_PERCENT', 15, { max: 99 }),
    }),
    usage: Object.freeze({ intervalMin: read.number('CLOUD_USAGE_INTERVAL_MIN', 15, { min: 1 }) }),
    alerts: Object.freeze({
      webhook: read.url('CLOUD_ALERT_WEBHOOK', { protocols: ['https:', 'http:'] }),
      token: read.text('CLOUD_ALERT_TOKEN'),
      repeatMin: read.number('CLOUD_ALERT_REPEAT_MIN', 30, { min: 1 }),
    }),
    logs: Object.freeze({
      fileBytes: read.number('CLOUD_LOG_FILE_MB', 10, { min: 1 }) * 1024 * 1024,
      files: read.number('CLOUD_LOG_FILES', 5, { min: 1, max: 50 }),
    }),
  };

  return { config: Object.freeze(config), warnings: read.warnings, errors: read.errors };
}
