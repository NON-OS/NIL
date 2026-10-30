import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import loadConfig from '../config/loadConfig.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import workspaceSecret from '../turn/workspaceSecret.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import stopWorkspace from '../provisioning/stopWorkspace.js';
import suspendWorkspace from '../provisioning/suspendWorkspace.js';
import resumeWorkspace from '../provisioning/resumeWorkspace.js';
import checkRelay from '../ops/checkRelay.js';
import nameStatus from '../names/nameStatus.js';
import testContext from './helpers/testContext.js';
import fakeDriver from './helpers/fakeDriver.js';
import baseEnv from './helpers/baseEnv.js';

const OWNER = `0x${'c'.repeat(40)}`;
const SECRET = 's'.repeat(64);
const WILDCARD = { CLOUD_TLS: 'wildcard', CLOUD_DNS_PROVIDER: 'ovh' };

function callsOn(extra = {}) {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nil-turn-')), 'turndb');
  return { CLOUD_CALLS: 'on', CLOUD_TURN_SECRET: SECRET, CLOUD_TURN_DB: db, ...WILDCARD, ...extra };
}

// what the relay would accept: the secrets in coturn's table for its realm
const secrets = (config) => {
  const db = new DatabaseSync(config.calls.db, { readOnly: true });
  try {
    return db.prepare('SELECT value FROM turn_secret WHERE realm = ? ORDER BY value').all(config.calls.host).map((r) => r.value);
  } finally {
    db.close();
  }
};

async function running(ctx, name) {
  const ws = createWorkspace(ctx, { name, owner: OWNER });
  return provisionWorkspace(ctx, ws.id);
}

test('calls are off unless turned on, and on they need the secret and a host name', () => {
  assert.equal(loadConfig(baseEnv).config.calls, null);
  assert.ok(loadConfig({ ...baseEnv, CLOUD_CALLS: 'on', ...WILDCARD }).errors.some((e) => /CLOUD_TURN_SECRET/.test(e)));
  assert.ok(loadConfig({ ...baseEnv, CLOUD_CALLS: 'on', CLOUD_TURN_SECRET: 'short', ...WILDCARD }).errors.some((e) => /at least 32/.test(e)));
  assert.ok(loadConfig({ ...baseEnv, ...callsOn({ CLOUD_TURN_HOST: 'not a host' }) }).errors.some((e) => /CLOUD_TURN_HOST/.test(e)));

  const { config, errors, warnings } = loadConfig({ ...baseEnv, ...callsOn() });
  assert.deepEqual(errors, []);
  assert.equal(config.calls.host, 'turn.nil.test');
  assert.deepEqual(config.calls.urls, ['turns:turn.nil.test:5349?transport=tcp', 'turn:turn.nil.test:3478?transport=udp']);
  assert.equal(config.calls.certificate, '/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/wildcard_.nil.test/wildcard_.nil.test.crt');
  assert.ok(!warnings.some((w) => /relay/.test(w)));
  assert.ok(!JSON.stringify(warnings).includes(SECRET));
});

test('without the wildcard certificate the relay is offered without TLS, and says why', () => {
  const onDemand = loadConfig({ ...baseEnv, ...callsOn({ CLOUD_TLS: 'on-demand' }) });
  assert.deepEqual(onDemand.config.calls.urls, ['turn:turn.nil.test:3478?transport=udp']);
  assert.equal(onDemand.config.calls.certificate, null);
  assert.ok(onDemand.warnings.some((w) => /no certificate for turn\.nil\.test/.test(w)));
  // two levels below the domain is outside the wildcard too
  const deep = loadConfig({ ...baseEnv, ...callsOn({ CLOUD_TURN_HOST: 'a.turn.nil.test' }) });
  assert.deepEqual(deep.config.calls.urls, ['turn:a.turn.nil.test:3478?transport=udp']);
});

test('each workspace calls through the relay with a secret of its own, which the shared env file can’t change', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nil-env-')), 'workspace.env');
  fs.writeFileSync(file, 'CALLS=off\nTURN_SECRET=chosen-by-the-shared-file\nTURN_URLS=turn:elsewhere.example:3478\n');
  const { config } = loadConfig({ ...baseEnv, ...callsOn({ CLOUD_APP_ENV_FILE: file }) });
  const spec = (id) => workspaceSpec(config, { id, name: 'acme', image: 'i', volume: 'v', plan: 'standard', invoiceSlot: 0 });
  const a = spec('0123456789abcdef');
  const b = spec('fedcba9876543210');
  assert.equal(a.env.CALLS, 'on');
  assert.equal(a.env.TURN_URLS, 'turns:turn.nil.test:5349?transport=tcp,turn:turn.nil.test:3478?transport=udp');
  assert.equal(a.env.TURN_SECRET, workspaceSecret(SECRET, '0123456789abcdef'));
  assert.match(a.env.TURN_SECRET, /^[0-9a-f]{64}$/);
  assert.notEqual(a.env.TURN_SECRET, b.env.TURN_SECRET);
  assert.notEqual(a.env.TURN_SECRET, SECRET);
  // and a new CLOUD_TURN_SECRET gives every workspace a new one
  assert.notEqual(workspaceSecret('t'.repeat(64), '0123456789abcdef'), a.env.TURN_SECRET);
});

test('the relay accepts the secrets of running workspaces and no others, as they start, stop and come back', async () => {
  const ctx = testContext({ env: callsOn() });
  const acme = await running(ctx, 'acme');
  const globex = await running(ctx, 'globex');
  const of = (ws) => workspaceSecret(SECRET, ws.id);
  assert.deepEqual(secrets(ctx.config), [of(acme), of(globex)].sort());
  // the database is the control plane's and its group's, which the relay is in
  assert.equal(fs.statSync(ctx.config.calls.db).mode & 0o777, 0o660);

  await stopWorkspace(ctx, acme.id);
  assert.deepEqual(secrets(ctx.config), [of(globex)]);
  await suspendWorkspace(ctx, globex.id, 'abuse report');
  assert.deepEqual(secrets(ctx.config), []);
  await resumeWorkspace(ctx, acme.id);
  assert.deepEqual(secrets(ctx.config), [of(acme)]);

  // a row nobody should have, written by hand or left from an old secret, goes on the next sync
  const db = new DatabaseSync(ctx.config.calls.db);
  db.prepare('INSERT INTO turn_secret (realm, value) VALUES (?, ?)').run(ctx.config.calls.host, 'stale');
  db.close();
  await ctx.routes.sync();
  assert.deepEqual(secrets(ctx.config), [of(acme)]);
});

test('a relay database that can’t be written alerts, and the routes still update', async () => {
  const ctx = testContext({ env: callsOn() });
  ctx.turn = { sync: () => { throw new Error('disk full'); } };
  const ws = await running(ctx, 'acme');
  assert.ok(ctx.alerts.some((a) => a.event === 'turn.secrets_failed' && /disk full/.test(a.message)));
  assert.match(fs.readFileSync(ctx.config.caddy.file, 'utf8'), new RegExp(`reverse_proxy nil-${ws.id}:3000`));
});

test('the relay names can’t be signed up for', () => {
  const ctx = testContext();
  for (const name of ['turn', 'turns', 'stun', 'relay', 'sfu']) assert.equal(nameStatus(ctx, name).available, false, name);
});

test('hourly: a relay that is down alerts, and one older than Caddy’s certificate restarts', async () => {
  const restarted = [];
  let relay = { running: true, startedAt: Date.parse('2026-10-30T10:00:00Z') };
  let issued = Date.parse('2026-10-19T00:43:00Z');
  const driver = {
    ...fakeDriver(),
    service: async (name) => (name === 'nil-turn' ? relay : null),
    serviceFileTime: async (container, file) => (container === 'nil-caddy' && file.endsWith('wildcard_.nil.test.crt') ? issued : null),
    restartService: async (name) => void restarted.push(name),
  };
  const ctx = testContext({ env: callsOn(), driver });

  assert.deepEqual(await checkRelay(ctx), { running: true });
  assert.deepEqual(restarted, []);

  issued = Date.parse('2026-10-30T11:00:00Z');
  assert.deepEqual(await checkRelay(ctx), { running: true, restarted: true });
  assert.deepEqual(restarted, ['nil-turn']);

  relay = { running: false, startedAt: null };
  assert.deepEqual(await checkRelay(ctx), { running: false });
  assert.ok(ctx.alerts.some((a) => a.event === 'turn.down' && a.severity === 'critical'));

  relay = null;
  await checkRelay(ctx);
  assert.equal(ctx.alerts.filter((a) => a.event === 'turn.down').length, 2);
  // with calls off there is nothing to check
  assert.equal(await checkRelay(testContext({ driver })), null);
});
