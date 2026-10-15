import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import socket from './helpers/socket.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const guest = client(base);
const ids = {};
const settle = () => new Promise((r) => setTimeout(r, 150));

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  ids.shared = (await owner('POST', '/api/projects', { name: 'Client Website' })).data.project.id;
  ids.secret = (await owner('POST', '/api/projects', { name: 'Fundraising' })).data.project.id;
  ids.sharedTask = (await owner('POST', '/api/tasks', { title: 'Homepage copy', projectId: ids.shared })).data.task.id;
  ids.secretTask = (await owner('POST', '/api/tasks', { title: 'Term sheet with Acme Ventures', projectId: ids.secret })).data.task.id;
});
after(() => srv.close());

test('a guest sees only the projects shared with them', async () => {
  assert.equal((await owner('POST', '/api/invites', { role: 'guest' })).status, 400);
  const inv = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.shared] });
  const joined = await guest.wallet(wallet(), 'invite', { name: 'Gus Guest', inviteToken: inv.data.token });
  assert.equal(joined.data.user.role, 'guest');
  ids.guest = joined.data.user.id;

  const boot = (await guest('GET', '/api/bootstrap')).data;
  assert.equal(boot.guest, true);
  assert.deepEqual(boot.projects.map((p) => p.name), ['Client Website']);
  assert.deepEqual(boot.tasks.map((t) => t.title), ['Homepage copy']);
  assert.equal(boot.users.some((u) => u.id === ids.member), false);
  assert.equal(JSON.stringify(boot).includes('Acme'), false);

  assert.equal((await guest('GET', `/api/tasks/${ids.secretTask}/detail`)).status, 404);
  assert.equal((await guest('POST', '/api/tasks', { title: 'Sneak in', projectId: ids.secret })).status, 403);
  assert.equal((await guest('POST', '/api/tasks', { title: 'No project' })).status, 403);
  assert.equal((await guest('POST', '/api/tasks', { title: 'Hero image', projectId: ids.shared })).status, 200);
  assert.equal((await guest('PATCH', `/api/tasks/${ids.sharedTask}`, { projectId: ids.secret })).status, 403);
  assert.equal((await guest('POST', `/api/tasks/${ids.sharedTask}/comments`, { body: 'Draft attached' })).status, 200);
  assert.equal((await guest('GET', '/api/activity')).data.some((a) => a.taskId === ids.secretTask), false);
  assert.equal((await guest('GET', '/api/export/tasks.csv')).data.includes('Acme'), false);

  for (const [method, url] of [['GET', '/api/proposals'], ['GET', '/api/docs'], ['POST', '/api/projects'], ['POST', '/api/invites'], ['POST', '/api/ai/brief']]) {
    assert.equal((await guest(method, url, method === 'POST' ? {} : undefined)).status, 403, url);
  }
});

test('live updates from other projects never reach a guest', async () => {
  const live = await socket(base(), guest.cookie());
  await owner('PATCH', `/api/tasks/${ids.secretTask}`, { title: 'Term sheet v2 with Acme Ventures' });
  await owner('PATCH', `/api/tasks/${ids.sharedTask}`, { priority: 3 });
  await owner('POST', '/api/projects', { name: 'Hiring plan' });
  await settle();
  const text = JSON.stringify(live.events);
  assert.equal(text.includes('Acme'), false);
  assert.equal(text.includes('Hiring plan'), false);
  assert.ok(live.events.some((e) => e.type === 'task' && e.task.id === ids.sharedTask));
  live.close();
});

test('admins can widen or narrow what a guest sees, effective at once', async () => {
  await owner('PATCH', `/api/users/${ids.guest}`, { projects: [ids.shared, ids.secret] });
  assert.equal((await guest('GET', `/api/tasks/${ids.secretTask}/detail`)).status, 200);
  await owner('PATCH', `/api/users/${ids.guest}`, { projects: [ids.shared] });
  assert.equal((await guest('GET', `/api/tasks/${ids.secretTask}/detail`)).status, 404);
  assert.equal((await owner('PATCH', `/api/users/${ids.member}`, { projects: [ids.shared] })).status, 400);
});

test('members can invite only when the workspace allows it, and never admins', async () => {
  assert.equal((await member('POST', '/api/invites', { role: 'member' })).status, 403);
  assert.equal((await member('PUT', '/api/sharing', { invitePolicy: 'members' })).status, 403);
  await owner('PUT', '/api/sharing', { invitePolicy: 'members' });
  assert.equal((await member('POST', '/api/invites', { role: 'admin' })).status, 403);
  assert.equal((await member('POST', '/api/invites', { role: 'guest', projectIds: [ids.shared] })).status, 200);
  assert.equal((await member('GET', '/api/invites')).data.length, 1);
  assert.ok((await owner('GET', '/api/invites')).data.length >= 1);
  assert.equal((await guest('POST', '/api/invites', { role: 'member' })).status, 403);
});

test('share links: off by default, read-only, private-safe, revocable', async () => {
  assert.equal((await member('POST', '/api/share-links', { kind: 'project', targetId: ids.shared })).status, 403);
  await owner('PUT', '/api/sharing', { shareLinks: true });
  await owner('POST', '/api/tasks', { title: 'Private pricing notes', projectId: ids.shared, private: true });
  const made = await member('POST', '/api/share-links', { kind: 'project', targetId: ids.shared, days: 7 });
  assert.equal(made.status, 200);
  const page = await fetch(`${base()}/api/public/share/${made.data.token}`);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  const view = await page.json();
  assert.equal(view.project.name, 'Client Website');
  assert.ok(view.tasks.some((t) => t.title === 'Homepage copy'));
  assert.equal(JSON.stringify(view).includes('Private pricing'), false);
  assert.equal(JSON.stringify(view).includes('Erik'), false);

  const priv = (await owner('POST', '/api/tasks', { title: 'Secret', private: true, projectId: ids.shared })).data.task;
  assert.equal((await owner('POST', '/api/share-links', { kind: 'task', targetId: priv.id })).status, 400);
  assert.equal((await guest('POST', '/api/share-links', { kind: 'task', targetId: ids.sharedTask })).status, 403);

  assert.equal((await owner('DELETE', `/api/share-links/${made.data.link.id}`)).status, 200);
  assert.equal((await fetch(`${base()}/api/public/share/${made.data.token}`)).status, 404);
  assert.equal((await fetch(`${base()}/api/public/share/not-a-real-token`)).status, 404);

  const again = await owner('POST', '/api/share-links', { kind: 'task', targetId: ids.sharedTask });
  await owner('PUT', '/api/sharing', { shareLinks: false });
  assert.equal((await fetch(`${base()}/api/public/share/${again.data.token}`)).status, 404);
});
