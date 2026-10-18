import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import createWorkspace from '../provisioning/createWorkspace.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import resumeWorkspace from '../provisioning/resumeWorkspace.js';
import createSignupFlow from '../signup/createSignupFlow.js';
import createPublicServer from '../signup/http/createPublicServer.js';
import checkIdle from '../ops/checkIdle.js';
import states from '../provisioning/states.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'a'.repeat(40)}`;
const DAY = 86_400_000;
const MINUTE = 60_000;

function notice(server, host) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      http.get(`http://127.0.0.1:${server.address().port}/unavailable`, { headers: { host } }, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, text })));
      }).on('error', reject);
    });
  });
}

test('a claimed workspace whose data stops changing is paused with a notice, then deleted', async () => {
  let now = Date.UTC(2026, 9, 21);
  const ctx = testContext({ backups: true, now: () => now, env: { CLOUD_IDLE_DAYS: '90', CLOUD_IDLE_NOTICE_DAYS: '30', CLOUD_CONTACT: 'ops@nil.test' } });
  const ws = await provisionWorkspace(ctx, createWorkspace(ctx, { name: 'quiet', owner: OWNER }).id);
  ctx.store.workspaces.update(ws.id, { claimedAt: now });

  // a write right after a (re)start is the app's own, and doesn't count as use
  now += 60 * DAY;
  ctx.driver.writes.set(ws.id, { startedAt: now, at: now + 5 * MINUTE });
  await checkIdle(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).activeAt, ctx.store.workspaces.get(ws.id).claimedAt);
  // a later one does
  ctx.driver.writes.set(ws.id, { startedAt: now, at: now + 2 * DAY });
  now += 3 * DAY;
  await checkIdle(ctx);
  const seen = ctx.store.workspaces.get(ws.id).activeAt;
  assert.equal(seen, now - DAY);

  now = seen + 89 * DAY;
  await checkIdle(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active');
  now = seen + 91 * DAY;
  await checkIdle(ctx);
  const paused = ctx.store.workspaces.get(ws.id);
  assert.equal(paused.state, 'suspended');
  assert.equal(paused.suspendReason, states.reasons.idle);
  assert.equal(ctx.alerts.at(-1).event, 'workspace.idle_paused');
  const page = await notice(createPublicServer(ctx, createSignupFlow(ctx, { provision: async () => {} })), 'quiet.nil.test');
  assert.equal(page.status, 503);
  assert.match(page.text, /Nobody has used it for a long time/);
  assert.match(page.text, new RegExp(new Date(paused.suspendedAt + 30 * DAY).toISOString().slice(0, 10)));
  assert.match(page.text, /ops@nil\.test/);

  now += 31 * DAY;
  await checkIdle(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'deleting');
  assert.equal(ctx.store.backups.latest(ws.id).kind, 'final', 'a final encrypted backup comes first');
});

test('bringing a paused workspace back counts as use, and unclaimed or idle-off ones are left alone', async () => {
  let now = Date.UTC(2026, 9, 21);
  const ctx = testContext({ now: () => now, env: { CLOUD_IDLE_DAYS: '90' } });
  const ws = await provisionWorkspace(ctx, createWorkspace(ctx, { name: 'back', owner: OWNER }).id);
  const unclaimed = await provisionWorkspace(ctx, createWorkspace(ctx, { name: 'fresh', owner: OWNER }).id);
  ctx.store.workspaces.update(ws.id, { claimedAt: now });
  now += 100 * DAY;
  await checkIdle(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'suspended');
  assert.equal(ctx.store.workspaces.get(unclaimed.id).state, 'active', 'unclaimed ones have their own, shorter rule');
  await resumeWorkspace(ctx, ws.id);
  await checkIdle(ctx);
  assert.equal(ctx.store.workspaces.get(ws.id).state, 'active');

  const off = testContext({ now: () => now, env: { CLOUD_IDLE_DAYS: '0' } });
  const kept = await provisionWorkspace(off, createWorkspace(off, { name: 'kept', owner: OWNER }).id);
  off.store.workspaces.update(kept.id, { claimedAt: 0 });
  await checkIdle(off);
  assert.equal(off.store.workspaces.get(kept.id).state, 'active');
});
