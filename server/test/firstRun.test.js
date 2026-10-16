import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};
const TODAY = '2026-11-02';

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Bike shop' })).data.user.id;
});
after(() => srv.close());

test('getting started belongs to whoever set the workspace up', async () => {
  assert.deepEqual((await owner('GET', '/api/first-run')).data, { active: true, quickAdd: false, invited: false, sample: null });
  // an agent is no teammate invited
  await owner('POST', '/api/agents', { name: 'Scout', access: 'read', allProjects: true });
  assert.equal((await owner('GET', '/api/first-run')).data.invited, false);
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  assert.equal((await owner('GET', '/api/first-run')).data.invited, true);
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  assert.deepEqual((await member('GET', '/api/first-run')).data, { active: false });
  assert.equal((await member('POST', '/api/first-run/sample', { today: TODAY })).status, 403);
  assert.equal((await owner('PATCH', '/api/first-run', { quickAdd: true })).data.quickAdd, true);
});

test('the sample project arrives with everyday tasks dated from the person’s today', async () => {
  const res = await owner('POST', '/api/first-run/sample', { today: TODAY });
  assert.equal(res.status, 200);
  ids.sample = res.data.sample.projectId;
  const boot = (await owner('GET', '/api/bootstrap')).data;
  assert.ok(boot.projects.some((p) => p.id === ids.sample && p.name === 'Sample project'));
  const tasks = boot.tasks.filter((t) => t.projectId === ids.sample);
  assert.equal(tasks.length, 9);
  assert.ok(tasks.every((t) => t.dueDate > TODAY));
  assert.ok(tasks.some((t) => t.title === 'Book a venue for the team offsite' && t.assigneeId === ids.owner));
  assert.equal((await owner('GET', '/api/search?q=venue')).data.tasks[0].title, 'Book a venue for the team offsite');
  assert.equal((await member('GET', '/api/bootstrap')).data.tasks.filter((t) => t.projectId === ids.sample).length, 9);
  assert.equal((await owner('POST', '/api/first-run/sample', { today: TODAY })).status, 409);
});

test('removing the sample erases its tasks and keeps anything added by hand', async () => {
  const own = (await member('POST', '/api/tasks', { title: 'Order inner tubes', projectId: ids.sample })).data.task;
  const sampleIds = sql.all('SELECT id FROM tasks WHERE project_id = ? AND id != ?', ids.sample, own.id).map((r) => r.id);
  assert.equal((await member('DELETE', '/api/first-run/sample')).status, 404);
  const res = await owner('DELETE', '/api/first-run/sample');
  assert.equal(res.status, 200);
  assert.equal(res.data.sample, null);
  for (const id of sampleIds) assert.equal(sql.get('SELECT 1 FROM tasks WHERE id = ?', id), undefined);
  assert.equal(sql.get('SELECT 1 FROM projects WHERE id = ?', ids.sample), undefined);
  const kept = (await member('GET', `/api/tasks/${own.id}/detail`)).data.task;
  assert.equal(kept.projectId, null);
  assert.deepEqual((await owner('GET', '/api/search?q=venue')).data.tasks, []);
});

test('dismissing the card puts it away, but a sample project can still be removed', async () => {
  const added = (await owner('POST', '/api/first-run/sample', { today: TODAY })).data.sample;
  const dismissed = (await owner('PATCH', '/api/first-run', { dismissed: true })).data;
  assert.deepEqual(dismissed, { active: false, sample: added });
  assert.deepEqual((await owner('DELETE', '/api/first-run/sample')).data, { active: false, sample: null });
});
