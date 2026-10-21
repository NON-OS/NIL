import path from 'node:path';
import envReader from './envReader.js';
import parsePlans from './parsePlans.js';
import parseDailyTime from './parseDailyTime.js';
import parseBackupTarget from './parseBackupTarget.js';
import parseEnvFile from './parseEnvFile.js';
import signupRules from './signupRules.js';
import backupKeys from '../backups/backupKeys.js';
import readTelegram from './readTelegram.js';
import readWalletConnect from './readWalletConnect.js';
import checksumAddress from '../lib/checksumAddress.js';

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

  const image = read.required('CLOUD_APP_IMAGE', 'Set it to the Nil image every workspace runs, for example localhost/nonos/nil:3.0.0.');
  // each workspace runs as its own uid, this plus its number, never 1000 like the control plane
  const uidBase = read.number('CLOUD_APP_UID_BASE', 200_000, { max: 2_000_000_000 });
  if (uidBase > 0 && uidBase < 10_000) read.fail('CLOUD_APP_UID_BASE must be 10000 or more, clear of the uids of accounts on the host, or 0.');
  if (uidBase === 0) read.warn('CLOUD_APP_UID_BASE=0 runs every workspace as uid 1000, the control plane’s own. Use it only to go back to a release from before each workspace had its own uid.');
  if (read.raw('CLOUD_APP_USER')) read.warn('CLOUD_APP_USER is no longer used: each workspace runs as its own uid from CLOUD_APP_UID_BASE.');

  const treasury = read.text('CLOUD_PLAN_TREASURY');
  if (treasury && !ADDRESS.test(treasury)) read.fail('CLOUD_PLAN_TREASURY must be an Ethereum address (0x and 40 hex characters).');
  // every customer pays this one address, and the workspaces only see it lowercased, so its
  // EIP-55 checksum is checked here or nowhere
  if (treasury && ADDRESS.test(treasury) && /[a-f]/i.test(treasury.slice(2))) {
    const hex = treasury.slice(2);
    const oneCase = hex === hex.toLowerCase() || hex === hex.toUpperCase();
    if (!oneCase && checksumAddress(treasury) !== treasury) read.fail('CLOUD_PLAN_TREASURY doesn’t match its checksum, so a character is probably mistyped. Every customer pays this address: copy it again from the wallet that holds it.');
    if (oneCase) read.warn('CLOUD_PLAN_TREASURY is all one case, so it carries no checksum and a mistyped character can’t be caught. Paste it with mixed case, as the wallet shows it.');
  }
  if (!treasury) read.warn('CLOUD_PLAN_TREASURY is not set, so hosted workspaces run in community mode: every tool is unlocked and nothing is billed.');

  // One treasury, many workspaces: each gets its own slice of the invoice suffixes so no two can
  // ask for the same amount, and the shared key keeps the slices from showing who paid what.
  const invoiceSlots = read.number('CLOUD_INVOICE_SLOTS', 1000, { min: 1, max: 999999 });
  const invoiceKey = read.text('CLOUD_INVOICE_KEY');
  if (invoiceKey && invoiceKey.length < 32) read.fail('CLOUD_INVOICE_KEY must be at least 32 characters. Make one with: openssl rand -hex 32');
  if (treasury && !invoiceKey) read.warn('CLOUD_INVOICE_KEY is not set, so workspaces draw invoice amounts at random and two could rarely ask for the same one. Set it to a long random secret.');

  const extraEnv = parseEnvFile(read.text('CLOUD_APP_ENV_FILE'), read);
  // every slot needs at least one suffix of its own within the digits the workspaces use
  const suffixDigits = Number(extraEnv.PLAN_SUFFIX_DIGITS || 4);
  if (treasury && invoiceKey && invoiceSlots > 10 ** suffixDigits - 1) {
    read.fail(`CLOUD_INVOICE_SLOTS=${invoiceSlots} needs more invoice digits than PLAN_SUFFIX_DIGITS=${suffixDigits} gives. Set PLAN_SUFFIX_DIGITS=6 in the workspace env file, or lower CLOUD_INVOICE_SLOTS.`);
  }

  const rpcUrl = read.raw('CLOUD_RPC_URL') === 'off' ? 'off' : read.url('CLOUD_RPC_URL', { protocols: ['https:', 'http:'] });
  if (!rpcUrl) read.fail('CLOUD_RPC_URL is not set. Point it at your own Ethereum node (see README), or set it to off to turn on-chain features and billing off.');
  if (rpcUrl === 'off' && treasury) read.warn('CLOUD_RPC_URL is off, so workspaces can’t check payments and run in community mode despite CLOUD_PLAN_TREASURY.');
  // How workspaces use Nil's verifier: off, shadow (check on the side, the launch default) or
  // enforce (act only on proven answers; CLOUD_RPC_URL is then the verifier itself).
  const verifierKey = read.text('CLOUD_VERIFIER_KEY');
  if (verifierKey && verifierKey.length < 32) read.fail('CLOUD_VERIFIER_KEY must be at least 32 characters. Make one with: openssl rand -hex 32');
  const verifierUrl = read.url('CLOUD_VERIFIER_URL', { protocols: ['http:', 'https:'] });
  let verifierMode = rpcUrl === 'off' ? 'off' : read.oneOf('CLOUD_VERIFIER_MODE', ['off', 'shadow', 'enforce'], 'shadow');
  if (verifierMode === 'enforce' && !verifierKey) read.fail('CLOUD_VERIFIER_MODE=enforce needs the verifier’s key: set VERIFIER_KEY in .env, which the control plane gets as CLOUD_VERIFIER_KEY, and point CLOUD_RPC_URL at the verifier.');
  if (verifierMode === 'shadow' && (!verifierKey || !verifierUrl)) {
    read.warn(`CLOUD_VERIFIER_MODE=shadow, but ${verifierKey ? 'CLOUD_VERIFIER_URL' : 'VERIFIER_KEY in .env'} is not set, so workspaces’ chain reads aren’t checked. Run Nil’s verifier (docker-compose.verifier.yml) to turn it on.`);
    verifierMode = 'off';
  }
  const egress = read.oneOf('CLOUD_EGRESS', ['rpc-only', 'open'], 'rpc-only');
  // The egress proxy (egress.js) gives rpc-only workspaces a way out for webhooks, model
  // endpoints and AI providers: https to public addresses only, through a CONNECT tunnel.
  let egressProxy = read.oneOf('CLOUD_EGRESS_PROXY', ['on', 'off'], 'off') === 'on';
  if (egressProxy && egress === 'open') {
    read.warn('CLOUD_EGRESS_PROXY=on does nothing with CLOUD_EGRESS=open: workspaces already reach the internet directly.');
    egressProxy = false;
  }
  const egressContainer = read.text('CLOUD_EGRESS_CONTAINER', 'nil-egress');
  if (egressProxy && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(egressContainer)) read.fail('CLOUD_EGRESS_CONTAINER must be a container name.');

  const sourceUrl = read.url('CLOUD_SOURCE_URL');
  if (!sourceUrl) read.warn('CLOUD_SOURCE_URL is not set, so workspaces show no link to the source they run. Set it to the repository you deploy from once it is published.');

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
  if (tls === 'wildcard' && !/^[a-z0-9_]+$/.test(dnsProvider ?? '')) read.fail('CLOUD_TLS=wildcard needs CLOUD_DNS_PROVIDER, the name of the Caddy DNS module (for example hetzner, cloudflare or ovh).');
  const signup = signupRules(read);
  // On-demand certificates come from Let's Encrypt one workspace at a time, at most 50 a week for
  // the domain, so open sign-ups can use them up for everyone, and each workspace's name lands in
  // the public certificate logs. Only a warning (and an alert at start), so a server already
  // running this way keeps running; CLOUD_TLS_STRICT=on refuses to start instead.
  if (tls === 'on-demand' && signup.open) {
    const advice = 'CLOUD_TLS=on-demand with open sign-ups: Let’s Encrypt issues at most 50 certificates a week for the domain, so a few dozen throwaway sign-ups leave real workspaces without one, and every workspace name lands in public certificate logs. Switch to CLOUD_TLS=wildcard, or set CLOUD_SIGNUP=closed.';
    if (read.oneOf('CLOUD_TLS_STRICT', ['on', 'off'], 'off') === 'on') read.fail(advice);
    else read.warn(advice);
  }
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
      // images arrive with deploy/release.sh; pulling is for a registry the operator controls
      pull: read.oneOf('CLOUD_IMAGE_PULL', ['missing', 'never', 'always'], 'never'),
      // Docker answers 409 for a moment while something it is removing is still in use
      removeTries: read.number('CLOUD_DOCKER_REMOVE_TRIES', 6, { min: 1, max: 50 }),
      removeWaitMs: read.number('CLOUD_DOCKER_REMOVE_WAIT_MS', 500, { min: 1, max: 60_000 }),
    }),
    app: Object.freeze({
      image,
      uidBase,
      port: read.number('CLOUD_APP_PORT', 3000, { min: 1, max: 65535 }),
      treasury: treasury ? treasury.toLowerCase() : null,
      invoiceSlots,
      invoiceKey: invoiceKey || null,
      rpcUrl,
      verifierMode,
      verifierKey: verifierMode === 'off' ? null : verifierKey,
      verifierUrl: verifierMode === 'shadow' ? verifierUrl : null,
      egress,
      // null unless workspaces reach the internet through the egress proxy
      egressProxy: egressProxy ? Object.freeze({ container: egressContainer, port: read.number('CLOUD_EGRESS_PROXY_PORT', 3128, { min: 1, max: 65535 }) }) : null,
      extraEnv,
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
      verifierRelayPort: read.number('CLOUD_VERIFIER_RELAY_PORT', 8546, { min: 1, max: 65535 }),
      streamCloseDelayMin: read.number('CLOUD_STREAM_CLOSE_DELAY_MIN', 5, { max: 120 }),
    }),
    signup,
    // phone wallets on the sign-up page; null leaves the page and its policy as they always were
    walletConnect: readWalletConnect(read),
    lifecycle: Object.freeze({
      deleteGraceDays: read.number('CLOUD_DELETE_GRACE_DAYS', 14),
      upgradeMaxFailures: read.number('CLOUD_UPGRADE_MAX_FAILURES', 1),
      checkpointKeepDays: read.number('CLOUD_CHECKPOINT_KEEP_DAYS', 7),
      lockWaitSec: read.number('CLOUD_LOCK_WAIT_SEC', 900, { max: 86_400 }),
      lockLeaseSec: read.number('CLOUD_LOCK_LEASE_SEC', 300, { min: 30, max: 86_400 }),
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
    certs: Object.freeze({
      // 0 turns the check off, for a machine without public certificates
      warnDays: read.number('CLOUD_CERT_WARN_DAYS', 21, { max: 365 }),
      criticalDays: read.number('CLOUD_CERT_CRITICAL_DAYS', 7, { max: 365 }),
      checkAddress: read.text('CLOUD_CERT_CHECK_ADDRESS'),
    }),
    usage: Object.freeze({
      intervalMin: read.number('CLOUD_USAGE_INTERVAL_MIN', 15, { min: 1 }),
      suspendPercent: read.number('CLOUD_DISK_SUSPEND_PERCENT', 120, { max: 10_000 }),
      resumeGraceHours: read.number('CLOUD_DISK_RESUME_GRACE_HOURS', 24, { max: 24 * 365 }),
    }),
    alerts: Object.freeze({
      webhook: read.url('CLOUD_ALERT_WEBHOOK', { protocols: ['https:', 'http:'] }),
      token: read.text('CLOUD_ALERT_TOKEN'),
      telegram: readTelegram(read),
      repeatMin: read.number('CLOUD_ALERT_REPEAT_MIN', 30, { min: 1 }),
    }),
    logs: Object.freeze({
      fileBytes: read.number('CLOUD_LOG_FILE_MB', 10, { min: 1 }) * 1024 * 1024,
      files: read.number('CLOUD_LOG_FILES', 5, { min: 1, max: 50 }),
    }),
  };

  return { config: Object.freeze(config), warnings: read.warnings, errors: read.errors };
}
