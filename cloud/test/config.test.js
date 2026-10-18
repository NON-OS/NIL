import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadConfig from '../config/loadConfig.js';
import backupKeys from '../backups/backupKeys.js';
import baseEnv from './helpers/baseEnv.js';

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
    [{ CLOUD_INTERNAL_PORT: '8080' }, /must differ/],
    [{ CLOUD_CADDY_CONTAINER: '' }, /CLOUD_CADDY_CONTAINER/],
    [{ CLOUD_TLS: 'wildcard' }, /CLOUD_DNS_PROVIDER/],
    [{ CLOUD_PLANS: 'tiny:cpus=0,memory=1m,pids=2,disk=x' }, /cpus/],
    [{ CLOUD_DEFAULT_PLAN: 'gold' }, /CLOUD_DEFAULT_PLAN/],
    [{ CLOUD_BACKUP_TARGET: 'file:///srv/backups' }, /CLOUD_BACKUP_RECIPIENTS is empty/],
    [{ CLOUD_BACKUP_RECIPIENTS: 'nilbk-pub-nope' }, /entry 1/],
    [{ CLOUD_BACKUP_TARGET: 'ftp://host/x', CLOUD_BACKUP_RECIPIENTS: backupKeys.generate().publicKey }, /file:\/\/ or s3:\/\//],
    [{ CLOUD_BACKUP_TIME: '25:00' }, /CLOUD_BACKUP_TIME/],
    // with the chain on, workspaces act only on reads the verifier proved
    [{ CLOUD_VERIFIER_KEY: '' }, /CLOUD_VERIFIER_KEY is not set/],
    [{ CLOUD_VERIFIER_KEY: 'short' }, /CLOUD_VERIFIER_KEY must be at least 32/],
  ];
  for (const [env, pattern] of cases) {
    const { errors } = loadConfig({ ...baseEnv, ...env });
    assert.ok(errors.some((e) => pattern.test(e)), `${JSON.stringify(env)} → ${errors.join(' | ')}`);
  }
});

test('without the chain no verifier key is needed, and none reaches the workspaces', async () => {
  const { config, errors } = loadConfig({ ...baseEnv, CLOUD_RPC_URL: 'off', CLOUD_VERIFIER_KEY: '' });
  assert.deepEqual(errors, []);
  const { default: workspaceSpec } = await import('../runtime/workspaceSpec.js');
  assert.equal(workspaceSpec(config, { id: 'x', name: 'acme', image: 'i', volume: 'v', plan: 'standard' }).env.NOX_VERIFIER_KEY, undefined);
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
