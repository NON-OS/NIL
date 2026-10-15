import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import socket from './helpers/socket.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};
const settle = () => new Promise((r) => setTimeout(r, 150));

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallet(), 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

test('a private task is invisible to everyone but its creator and assignee, admins included', async () => {
  const live = await socket(base(), owner.cookie());
  const secret = (await ana('POST', '/api/tasks', { title: 'Draft my resignation letter', private: true })).data.task;
  assert.equal(secret.private, true);
  await ana('POST', `/api/tasks/${secret.id}/comments`, { body: 'note to self' });
  await settle();

  for (const outsider of [owner, ben]) {
    assert.equal((await outsider('GET', '/api/bootstrap')).data.tasks.some((t) => t.id === secret.id), false);
    assert.equal((await outsider('GET', `/api/tasks/${secret.id}/detail`)).status, 404);
    assert.equal((await outsider('PATCH', `/api/tasks/${secret.id}`, { title: 'gotcha' })).status, 404);
    assert.equal((await outsider('POST', `/api/tasks/${secret.id}/comments`, { body: 'hi' })).status, 404);
    assert.equal((await outsider('GET', '/api/activity')).data.some((a) => a.taskId === secret.id), false);
  }
  assert.equal((await owner('GET', '/api/export/tasks.csv')).data.includes('resignation'), false);
  assert.equal(JSON.stringify((await owner('GET', '/api/export/backup.json')).data).includes('resignation'), false);
  assert.equal(JSON.stringify(live.events).includes(secret.id), false);
  live.close();

  // assigning it brings in exactly one more person
  await ana('PATCH', `/api/tasks/${secret.id}`, { assigneeId: ids.ben });
  assert.equal((await ben('GET', `/api/tasks/${secret.id}/detail`)).status, 200);
  assert.equal((await owner('GET', `/api/tasks/${secret.id}/detail`)).status, 404);
});

test('making a task private pulls it from everyone else, live and in their inbox', async () => {
  const shared = (await owner('POST', '/api/tasks', { title: 'Plan the offsite', assigneeId: ids.ana })).data.task;
  await owner('POST', `/api/tasks/${shared.id}/comments`, { body: 'Ping @ben' });
  assert.ok((await ben('GET', '/api/notifications')).data.some((n) => n.taskId === shared.id));

  const live = await socket(base(), ben.cookie());
  assert.equal((await ben('PATCH', `/api/tasks/${shared.id}`, { private: true })).status, 403);
  await ana('PATCH', `/api/tasks/${shared.id}`, { private: true });
  await settle();
  assert.ok(live.events.some((e) => e.type === 'task.gone' && e.id === shared.id));
  assert.equal(live.events.some((e) => e.type === 'task' && e.task.id === shared.id), false);
  assert.equal((await ben('GET', '/api/notifications')).data.some((n) => n.taskId === shared.id), false);
  live.close();
});

test('the timer runs one at a time, stays private to you, and exports as CSV', async () => {
  const task = (await ana('POST', '/api/tasks', { title: '=cmd|calc' })).data.task;
  const first = await ana('POST', '/api/time/start', { taskId: task.id });
  assert.equal(first.data.timer.taskId, task.id);
  const second = await ana('POST', '/api/time/start', { note: 'Inbox zero' });
  assert.equal(second.data.timer.note, 'Inbox zero');
  assert.equal((await ana('GET', '/api/bootstrap')).data.timer.id, second.data.timer.id);
  await ana('POST', '/api/time/stop');
  assert.equal((await ana('GET', '/api/bootstrap')).data.timer, null);

  const now = Date.now();
  assert.equal((await ana('POST', '/api/time', { startedAt: now - 1000, endedAt: now - 5000 })).status, 400);
  assert.equal((await ana('POST', '/api/time', { startedAt: now - 30 * 3600_000, endedAt: now })).status, 400);
  const manual = await ana('POST', '/api/time', { taskId: task.id, startedAt: now - 90 * 60_000, endedAt: now - 30 * 60_000, note: 'Pairing' });
  assert.equal(manual.status, 200);

  const mine = (await ana('GET', '/api/time')).data.entries;
  assert.equal(mine.length, 3);
  assert.equal((await owner('GET', '/api/time')).data.entries.length, 0);
  await owner('DELETE', `/api/time/${manual.data.entry.id}`);
  assert.equal((await ana('GET', '/api/time')).data.entries.length, 3);

  const csv = (await ana('GET', '/api/time/export.csv')).data;
  assert.match(csv, /60,NON-\d+,'=cmd\|calc,Pairing/);
  assert.equal((await owner('POST', '/api/time/start', { taskId: (await ana('POST', '/api/tasks', { title: 'mine', private: true })).data.task.id })).status, 404);
});

test('a due reminder turns into a notification for its owner only', async () => {
  const task = (await ben('POST', '/api/tasks', { title: 'Renew the domain' })).data.task;
  assert.equal((await ben('POST', '/api/reminders', { remindAt: Date.now() - 3600_000, taskId: task.id })).status, 400);
  assert.equal((await ben('POST', '/api/reminders', { remindAt: Date.now() + 60_000 })).status, 400);
  const r = await ben('POST', '/api/reminders', { remindAt: Date.now() - 1000, taskId: task.id, note: 'before it lapses' });
  assert.equal(r.status, 200);
  await ben('POST', '/api/reminders', { remindAt: Date.now() + 3600_000, note: 'Call the accountant' });
  assert.equal((await ben('GET', '/api/reminders')).data.length, 2);
  assert.equal((await ana('GET', '/api/reminders')).data.length, 0);

  const { default: sendReminders } = await import('../jobs/sendReminders.js');
  sendReminders();
  const inbox = (await ben('GET', '/api/notifications')).data;
  const sent = inbox.find((n) => n.type === 'reminder');
  assert.equal(sent.taskId, task.id);
  assert.equal(sent.data.note, 'before it lapses');
  assert.equal((await ben('GET', '/api/reminders')).data.length, 1);
  assert.equal((await ana('GET', '/api/notifications')).data.some((n) => n.type === 'reminder'), false);
});
