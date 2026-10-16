import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import socket from './helpers/socket.js';
import sealed from './helpers/sealed.js';

// Notifications, watches, presence and the timesheet must never tell someone about a task they
// can't open. These are the cases a guest used to see through.
let srv;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const guest = client(base);
const ids = {};
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const notices = async (who) => (await who('GET', '/api/notifications')).data;
const mentions = (list, text) => JSON.stringify(list).includes(text);

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  ids.shared = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  ids.board = (await owner('POST', '/api/projects', { name: 'Board' })).data.project.id;
  const guestInvite = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.shared] });
  ids.guest = (await guest.wallet(wallet(), 'invite', { name: 'Gus Guest', inviteToken: guestInvite.data.token })).data.user.id;
});
after(() => srv.close());

test('a mention on a task the guest can’t open neither notifies them nor makes them a watcher', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Secret merger with Initech', projectId: ids.board })).data.task;
  await owner('POST', `/api/tasks/${task.id}/comments`, { body: '@Gus please ignore: price is $40M' });
  assert.equal((await guest('GET', `/api/tasks/${task.id}/detail`)).status, 404);
  const list = await notices(guest);
  assert.ok(!mentions(list, 'Initech') && !mentions(list, '$40M'));
  assert.ok(!(await owner('GET', `/api/tasks/${task.id}/detail`)).data.watchers.includes(ids.guest));
  // the same mention on a shared task still works
  const shared = (await owner('POST', '/api/tasks', { title: 'Homepage copy', projectId: ids.shared })).data.task;
  await owner('POST', `/api/tasks/${shared.id}/comments`, { body: '@Gus can you review?' });
  assert.ok(mentions(await notices(guest), 'Homepage copy'));
});

test('moving a task out of a guest’s projects drops their watch and its notifications', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Public roadmap', projectId: ids.shared })).data.task;
  await guest('PUT', `/api/tasks/${task.id}/watch`);
  await owner('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' });
  assert.ok(mentions(await notices(guest), 'Public roadmap'));

  await owner('PATCH', `/api/tasks/${task.id}`, { projectId: ids.board, title: 'Layoffs list Q4' });
  await owner('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
  const list = await notices(guest);
  assert.ok(!mentions(list, 'Layoffs') && !mentions(list, 'Public roadmap'), 'old and new notices about the task are gone');
  assert.ok(!(await owner('GET', `/api/tasks/${task.id}/detail`)).data.watchers.includes(ids.guest));
});

test('unsharing a project drops the guest’s watches on its tasks', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Launch checklist', projectId: ids.shared })).data.task;
  await guest('PUT', `/api/tasks/${task.id}/watch`);
  await owner('PATCH', `/api/tasks/${task.id}`, { priority: 2, status: 'in_progress' });
  assert.ok(mentions(await notices(guest), 'Launch checklist'));
  assert.equal((await owner('PATCH', `/api/users/${ids.guest}`, { projects: [] })).status, 200);
  assert.ok(!mentions(await notices(guest), 'Launch checklist'));
  assert.ok(!(await owner('GET', `/api/tasks/${task.id}/detail`)).data.watchers.includes(ids.guest));
  await owner('PATCH', `/api/users/${ids.guest}`, { projects: [ids.shared] });
});

test('vote notices go to members only', async () => {
  await owner('POST', '/api/proposals', { title: 'Acquire Initech for $40M?', options: ['Yes', 'No'] });
  assert.ok(mentions(await notices(member), 'Acquire Initech'));
  assert.ok(!mentions(await notices(guest), 'Acquire Initech'));
});

test('presence shows each viewer only the people and tasks they may see', async () => {
  const hidden = (await owner('POST', '/api/tasks', { title: 'Board-only', projectId: ids.board })).data.task;
  const shared = (await owner('POST', '/api/tasks', { title: 'Shared work', projectId: ids.shared })).data.task;
  const watching = await socket(base(), guest.cookie());
  const viewer = await socket(base(), member.cookie());
  const ownerSocket = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: owner.cookie() } });
  const memberSocket = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: member.cookie() } });
  await Promise.all([once(ownerSocket, 'open'), once(memberSocket, 'open')]);
  ownerSocket.send(JSON.stringify({ type: 'presence', viewing: hidden.id }));
  memberSocket.send(JSON.stringify({ type: 'presence', viewing: shared.id }));
  await settle();

  const guestView = watching.events.filter((e) => e.type === 'presence').at(-1).presence;
  assert.ok(!JSON.stringify(guestView).includes(hidden.id), 'the hidden task id stays hidden');
  assert.ok(!guestView.some((p) => p.userId === ids.member), 'a member the guest shares no task with stays hidden');
  assert.deepEqual(guestView.find((p) => p.userId === ids.owner)?.viewing, []);

  const memberView = viewer.events.filter((e) => e.type === 'presence').at(-1).presence;
  assert.deepEqual(memberView.find((p) => p.userId === ids.owner).viewing, [hidden.id]);
  assert.deepEqual(memberView.find((p) => p.userId === ids.member).viewing, [shared.id]);

  // the guest can't claim to be on a task they can't open, either
  const guestSocket = new WebSocket(`${base().replace('http', 'ws')}/ws`, { headers: { Cookie: guest.cookie() } });
  await once(guestSocket, 'open');
  guestSocket.send(JSON.stringify({ type: 'presence', viewing: hidden.id }));
  await settle();
  assert.deepEqual(viewer.events.filter((e) => e.type === 'presence').at(-1).presence.find((p) => p.userId === ids.guest).viewing, []);
  for (const ws of [ownerSocket, memberSocket, guestSocket]) ws.close();
  watching.close();
  viewer.close();
});

test('the timesheet shows no title for a task the guest can no longer open', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Brochure layout', projectId: ids.shared })).data.task;
  const now = Date.now();
  assert.equal((await guest('POST', '/api/time', { taskId: task.id, startedAt: now - 3_600_000, endedAt: now - 1_800_000 })).status, 200);
  assert.ok((await guest('GET', '/api/time/export.csv')).data.includes('Brochure layout'));
  await owner('PATCH', `/api/tasks/${task.id}`, { projectId: ids.board, title: 'Board pack: CEO pay' });
  const csv = (await guest('GET', '/api/time/export.csv')).data;
  assert.ok(!csv.includes('CEO pay') && !csv.includes('Brochure'));
  assert.match(csv, /A task you can no longer open/);
});

test('bounty totals leave out private tasks the viewer can’t open, admins included', async () => {
  const task = (await member('POST', '/api/tasks', { title: 'Side quest', assigneeId: ids.member })).data.task;
  assert.equal((await owner('PATCH', `/api/tasks/${task.id}`, { bounty: '1000' })).status, 200);
  const promised = async (who) => (await who('GET', '/api/bounties')).data.people.find((p) => p.userId === ids.member)?.promised ?? '0';
  assert.equal(await promised(owner), '1000');
  assert.equal((await member('PATCH', `/api/tasks/${task.id}`, { private: true, sealed: sealed(ids.member) })).status, 200);
  assert.equal(await promised(owner), '0');
  assert.equal(await promised(member), '1000');
});
