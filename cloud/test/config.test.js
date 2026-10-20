import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadConfig from '../config/loadConfig.js';
import backupKeys from '../backups/backupKeys.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import baseEnv from './helpers/baseEnv.js';

test('each workspace has its own uid, never 1000, unless set back for a rollback', () => {
  const at = (env, slot) => workspaceSpec(loadConfig({ ...baseEnv, ...env }).config, { id: 'x', name: 'acme', image: 'i', volume: 'v', plan: 'standard', invoiceSlot: slot }).user;
  assert.equal(at({}, 0), '200000:200000');
  assert.equal(at({}, 41), '200041:200041');
  assert.equal(at({ CLOUD_APP_UID_BASE: '500000' }, 3), '500003:500003');
  assert.ok(loadConfig({ ...baseEnv, CLOUD_APP_UID_BASE: '0' }).warnings.some((w) => /uid 1000/.test(w)));
  assert.equal(at({ CLOUD_APP_UID_BASE: '0' }, 41), '1000:1000');
  assert.ok(loadConfig({ ...baseEnv, CLOUD_APP_UID_BASE: '1000' }).errors.some((e) => /10000 or more/.test(e)));
  assert.ok(loadConfig({ ...baseEnv, CLOUD_APP_USER: '1000:1000' }).warnings.some((w) => /no longer used/.test(w)));
});

test('missing required settings are all reported at once', () => {
  const { errors } = loadConfig({});
  assert.equal(errors.length, 3);
  assert.match(errors.join('\n'), /CLOUD_DOMAIN/);
  assert.match(errors.join('\n'), /CLOUD_APP_IMAGE/);
  assert.match(errors.join('\n'), /CLOUD_RPC_URL/);
});

test('a complete configuration has no errors and sensible defaults', () => {
  const { config, errors, warnings } = loadConfig(baseEnv);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ['Backups are off: set CLOUD_BACKUP_TARGET and CLOUD_BACKUP_RECIPIENTS.']);
  assert.equal(config.signupHost, 'nil.test');
  assert.equal(config.caddy.tls, 'on-demand');
  assert.equal(config.app.egress, 'rpc-only');
  assert.equal(config.defaultPlan, 'standard');
  assert.deepEqual(config.plans.standard, { name: 'standard', cpus: 1, memoryBytes: 768 * 1024 ** 2, pids: 256, diskBytes: 5 * 1024 ** 3 });
  assert.equal(config.trustProxy, 0);
  assert.equal(config.backup.enabled, false);
});

test('values that are set but unusable fall back with a warning, and the value stays out of it', () => {
  const { config, warnings } = loadConfig({ ...baseEnv, CLOUD_PORT: 'eighty', CLOUD_EGRESS: 'wide', CLOUD_ALERT_WEBHOOK: 'ftp://secret-token@hooks' });
  assert.equal(config.listen.port, 8080);
  assert.equal(config.app.egress, 'rpc-only');
  assert.equal(config.alerts.webhook, null);
  assert.ok(warnings.some((w) => w.includes('CLOUD_PORT')));
  assert.ok(!warnings.join('\n').includes('secret-token'));
});

test('settings that would make the deployment unsafe or broken are errors', () => {
  const cases = [
    [{ CLOUD_DOMAIN: 'Not A Domain' }, /CLOUD_DOMAIN/],
    [{ CLOUD_PLAN_TREASURY: '0x1234' }, /CLOUD_PLAN_TREASURY/],
    // one character off from 0xC4155a7bcE81a5DFE03919eF81A02a44f30Cfbee
    [{ CLOUD_PLAN_TREASURY: '0xC4155a7bcE81a5DFE03919eF81A02a44f30Cfbef' }, /checksum/],
    [{ CLOUD_INTERNAL_PORT: '8080' }, /must differ/],
    [{ CLOUD_CADDY_CONTAINER: '' }, /CLOUD_CADDY_CONTAINER/],
    [{ CLOUD_TLS: 'wildcard' }, /CLOUD_DNS_PROVIDER/],
    [{ CLOUD_PLANS: 'tiny:cpus=0,memory=1m,pids=2,disk=x' }, /cpus/],
    [{ CLOUD_DEFAULT_PLAN: 'gold' }, /CLOUD_DEFAULT_PLAN/],
    [{ CLOUD_BACKUP_TARGET: 'file:///srv/backups' }, /CLOUD_BACKUP_RECIPIENTS is empty/],
    [{ CLOUD_BACKUP_RECIPIENTS: 'nilbk-pub-nope' }, /entry 1/],
    [{ CLOUD_BACKUP_TARGET: 'ftp://host/x', CLOUD_BACKUP_RECIPIENTS: backupKeys.generate().publicKey }, /file:\/\/ or s3:\/\//],
    [{ CLOUD_BACKUP_TIME: '25:00' }, /CLOUD_BACKUP_TIME/],
    // acting only on proven reads needs the verifier's key
    [{ CLOUD_VERIFIER_MODE: 'enforce', CLOUD_VERIFIER_KEY: '' }, /CLOUD_VERIFIER_MODE=enforce needs the verifier’s key/],
    [{ CLOUD_VERIFIER_KEY: 'short' }, /CLOUD_VERIFIER_KEY must be at least 32/],
  ];
  for (const [env, pattern] of cases) {
    const { errors } = loadConfig({ ...baseEnv, ...env });
    assert.ok(errors.some((e) => pattern.test(e)), `${JSON.stringify(env)} → ${errors.join(' | ')}`);
  }
});

test('the verifier runs in shadow by default; without its key or address the control plane still starts, says so, and it is off', async () => {
  const { default: workspaceSpec } = await import('../runtime/workspaceSpec.js');
  const env = (cfg) => workspaceSpec(cfg, { id: 'x', name: 'acme', image: 'i', volume: 'v', plan: 'standard' }).env;
  assert.equal(loadConfig(baseEnv).config.app.verifierMode, 'shadow');
  for (const missing of [{ CLOUD_VERIFIER_KEY: '' }, { CLOUD_VERIFIER_URL: '' }]) {
    const { config, errors, warnings } = loadConfig({ ...baseEnv, ...missing });
    assert.deepEqual(errors, []);
    assert.equal(config.app.verifierMode, 'off');
    assert.ok(warnings.some((w) => /CLOUD_VERIFIER_MODE=shadow, but .* is not set/.test(w)), warnings.join(' | '));
    assert.equal(env(config).NOX_VERIFIER_MODE, undefined);
    assert.equal(env(config).NOX_VERIFIER_KEY, undefined);
  }
  const off = loadConfig({ ...baseEnv, CLOUD_VERIFIER_MODE: 'off' });
  assert.deepEqual(off.errors, []);
  assert.equal(env(off.config).NOX_VERIFIER_KEY, undefined);
  assert.equal(env(loadConfig({ ...baseEnv, CLOUD_RPC_URL: 'off', CLOUD_VERIFIER_KEY: '' }).config).NOX_VERIFIER_MODE, undefined);

  // enforce: the workspaces' one address is the verifier, and no second one is handed out
  const enforce = env(loadConfig({ ...baseEnv, CLOUD_VERIFIER_MODE: 'enforce', CLOUD_RPC_URL: 'http://verifier:8545' }).config);
  assert.equal(enforce.NOX_VERIFIER_MODE, 'enforce');
  assert.equal(enforce.NOX_VERIFIER_KEY, 'v'.repeat(64));
  assert.equal(enforce.NOX_VERIFIER_URL, undefined);
});

test('open egress needs no Caddy container, and an S3 target reads its credentials', () => {
  const key = backupKeys.generate().publicKey;
  const { config, errors } = loadConfig({
    ...baseEnv,
    CLOUD_EGRESS: 'open',
    CLOUD_CADDY_CONTAINER: '',
    CLOUD_BACKUP_RECIPIENTS: key,
    CLOUD_BACKUP_TARGET: 's3://nil-backups/hosted',
    CLOUD_S3_ENDPOINT: 'https://fsn1.your-objectstorage.com',
    CLOUD_S3_REGION: 'fsn1',
    CLOUD_S3_ACCESS_KEY_ID: 'AK',
    CLOUD_S3_SECRET_ACCESS_KEY: 'SK',
  });
  assert.deepEqual(errors, []);
  assert.equal(config.backup.enabled, true);
  assert.deepEqual({ ...config.backup.target }, { kind: 's3', bucket: 'nil-backups', prefix: 'hosted', endpoint: 'https://fsn1.your-objectstorage.com', region: 'fsn1', accessKeyId: 'AK', secretAccessKey: 'SK', partBytes: 16 * 1024 * 1024 });
});

test('the treasury is taken with a valid checksum, and one with none is accepted with a warning', () => {
  const good = loadConfig({ ...baseEnv, CLOUD_PLAN_TREASURY: '0xC4155a7bcE81a5DFE03919eF81A02a44f30Cfbee' });
  assert.deepEqual(good.errors, []);
  assert.equal(good.config.app.treasury, '0xc4155a7bce81a5dfe03919ef81a02a44f30cfbee');
  const lower = loadConfig({ ...baseEnv, CLOUD_PLAN_TREASURY: '0xc4155a7bce81a5dfe03919ef81a02a44f30cfbee' });
  assert.deepEqual(lower.errors, []);
  assert.ok(lower.warnings.some((w) => /no checksum|carries no checksum/.test(w)));
});
