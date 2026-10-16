import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';
import pushBrowser from './helpers/pushBrowser.js';
import pushService from './helpers/pushService.js';

const HOST = 'push.example.test';
let srv;
let service;
let jobs;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};
const wallets = {};

const subscribe = (c, browser, extra = {}) => c('PUT', '/api/push/subscription', { ...browser.subscription, timeZone: 'Europe/Stockholm', ...extra });
const messages = (browser, deliveries) => deliveries.filter((d) => d.url === browser.subscription.endpoint).map((d) => browser.open(d.body).message);
// a due time a few minutes from now, on the UTC clock
const soon = (minutes) => {
  const at = new Date(Date.now() + minutes * 60_000);
  return { dueDate: at.toISOString().slice(0, 10), dueTime: at.toISOString().slice(11, 16), timeZone: 'UTC' };
};

before(async () => {
  service = pushService(HOST);
  srv = await startServer({ env: { PUSH_SERVICES: HOST } });
  jobs = {
    reminders: (await import('../jobs/sendReminders.js')).default,
    due: (await import('../jobs/sendDueAlerts.js')).default,
    calendar: (await import('../lib/calendar.js')).default,
    zonedTime: (await import('../lib/zonedTime.js')).default,
    notify: (await import('../services/notify.js')).default,
  };
  wallets.owner = wallet();
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    wallets[who] = wallet();
    ids[who] = (await c.wallet(wallets[who], 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => {
  service.restore();
  srv.close();
});

test('a device opts in with keys the server checks, and each push is encrypted and signed', async () => {
  const info = (await ben('GET', '/api/push')).data;
  assert.equal(info.enabled, true);
  assert.equal(Buffer.from(info.publicKey, 'base64url').length, 65);
  assert.equal(info.devices, 0);

  const phone = pushBrowser(HOST);
  const bad = [
    { ...phone.subscription, endpoint: 'https://evil.example/send/x' },
    { ...phone.subscription, endpoint: `http://${HOST}/send/x` },
    { ...phone.subscription, keys: { ...phone.subscription.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } },
    { ...phone.subscription, keys: { ...phone.subscription.keys, auth: 'c2hvcnQ' } },
    { ...phone.subscription, timeZone: 'Mars/Olympus_Mons' },
  ];
  for (const body of bad) assert.equal((await ben('PUT', '/api/push/subscription', body)).status, 400);

  const on = await subscribe(ben, phone);
  assert.equal(on.status, 200);
  assert.deepEqual(on.data, { device: { showNames: true, timeZone: 'Europe/Stockholm' }, devices: 1 });
  assert.equal((await subscribe(ben, phone)).data.devices, 1);

  const mark = service.mark();
  const task = (await owner('POST', '/api/tasks', { title: 'Plan the offsite', assigneeId: ids.ben })).data.task;
  const [delivery] = await service.since(mark);
  assert.equal(delivery.url, phone.subscription.endpoint);
  assert.equal(delivery.redirect, 'manual');
  assert.equal(delivery.headers['content-encoding'], 'aes128gcm');
  assert.equal(delivery.headers.ttl, String(24 * 3600));
  assert.equal(delivery.headers.urgency, 'normal');

  const [, token, key] = delivery.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, info.publicKey);
  const [header, claims, signature] = token.split('.');
  const point = Buffer.from(key, 'base64url');
  const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  const decoded = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(decoded.aud, `https://${HOST}`);
  assert.ok(decoded.exp * 1000 > Date.now() && decoded.exp * 1000 <= Date.now() + 24 * 3_600_000);

  // padded to a whole block, so the push service learns nothing from the size
  assert.equal((delivery.body.length - 86 - 16) % 1024, 0);
  const { message } = phone.open(delivery.body);
  assert.deepEqual({ ...message, tag: undefined }, { title: 'Erik Lind assigned you a task', body: 'Plan the offsite', task: task.id, tag: undefined });
  await ben('POST', '/api/push/unsubscribe', { endpoint: phone.subscription.endpoint });
});

test('with task names off, a team notification says only what happened', async () => {
  const phone = pushBrowser(HOST);
  await subscribe(ben, phone);
  assert.equal((await ben('PATCH', '/api/push/subscription', { endpoint: phone.subscription.endpoint, showNames: false })).data.device.showNames, false);
  const task = (await owner('POST', '/api/tasks', { title: 'Quarterly numbers' })).data.task;
  const mark = service.mark();
  await owner('POST', `/api/tasks/${task.id}/comments`, { body: 'Can you check the totals, @ben?' });
  const [message] = messages(phone, await service.since(mark));
  assert.equal(message.title, 'You were mentioned on a task');
  assert.equal(message.task, task.id);
  assert.equal(/Quarterly|totals|Erik/.test(JSON.stringify(message)), false);
  // switching it back on is per device, and keeps the comment out all the same
  await ben('PATCH', '/api/push/subscription', { endpoint: phone.subscription.endpoint, showNames: true });
  const again = service.mark();
  await owner('POST', `/api/tasks/${task.id}/comments`, { body: 'One more thing, @ben: the totals.' });
  const [named] = messages(phone, await service.since(again));
  assert.deepEqual([named.title, named.body], ['Erik Lind mentioned you', 'Quarterly numbers']);
  assert.equal(JSON.stringify(named).includes('totals'), false);
  await ben('POST', '/api/push/unsubscribe', { endpoint: phone.subscription.endpoint });
});

test('a private task never puts its words into a push or a stored notification', async () => {
  const phone = pushBrowser(HOST);
  await subscribe(ben, phone);
  const seen = [];

  let mark = service.mark();
  const secret = (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana, ids.ben), assigneeId: ids.ben })).data.task;
  seen.push(...messages(phone, await service.since(mark)));
  assert.equal(seen[0].title, 'A private task was assigned to you');

  mark = service.mark();
  assert.equal((await ben('POST', '/api/reminders', { remindAt: Date.now() - 1000, taskId: secret.id, note: 'buy the ring for Sam' })).status, 200);
  jobs.reminders();
  seen.push(...messages(phone, await service.since(mark)));
  assert.equal(seen[1].title, 'Reminder');

  mark = service.mark();
  assert.equal((await ben('PATCH', `/api/tasks/${secret.id}`, soon(10))).status, 200);
  jobs.due();
  seen.push(...messages(phone, await service.since(mark)));
  assert.equal(seen[2].title, 'A private task is due');

  for (const message of seen) {
    assert.deepEqual(Object.keys(message).sort(), ['tag', 'task', 'title']);
    assert.equal(message.task, secret.id);
  }
  assert.equal(/ring|Sam/.test(JSON.stringify(seen)), false);
  const inbox = (await ben('GET', '/api/notifications')).data.filter((n) => n.taskId === secret.id);
  assert.ok(inbox.some((n) => n.type === 'due_soon'));
  for (const n of inbox) assert.equal(n.data.title ?? '', '');
  await ben('POST', '/api/push/unsubscribe', { endpoint: phone.subscription.endpoint });
});

test('reminders and due notes reach the device once, at the right moment', async () => {
  const phone = pushBrowser(HOST);
  await subscribe(ben, phone);
  const task = (await owner('POST', '/api/tasks', { title: 'Send the invoices', assigneeId: ids.ben })).data.task;

  let mark = service.mark();
  await ben('POST', '/api/reminders', { remindAt: Date.now() - 1000, taskId: task.id });
  jobs.reminders();
  const [reminder] = messages(phone, await service.since(mark));
  assert.deepEqual([reminder.title, reminder.body, reminder.task], ['Reminder', 'Send the invoices', task.id]);
  assert.equal(service.received.at(-1).headers.urgency, 'high');

  await ben('PATCH', `/api/tasks/${task.id}`, soon(10));
  mark = service.mark();
  jobs.due();
  const [dueSoon] = messages(phone, await service.since(mark));
  assert.deepEqual([dueSoon.title, dueSoon.body], ['Due soon', 'Send the invoices']);
  jobs.due();
  await service.settle();
  assert.equal(service.mark(), mark + 1);
  // a new time is a new due moment, so it gets its own note
  await ben('PATCH', `/api/tasks/${task.id}`, soon(20));
  jobs.due();
  await service.since(mark, 2);
  assert.equal(service.mark(), mark + 2);

  // tasks due today without a time: one morning note, at DUE_DAY_HOUR on the device's clock
  const today = jobs.calendar.today();
  for (const title of ['Water the plants', 'Pay rent']) await owner('POST', '/api/tasks', { title, assigneeId: ids.ben, dueDate: today });
  const morning = jobs.zonedTime.toUtc(today, '09:00', 'Europe/Stockholm');
  mark = service.mark();
  jobs.due(morning - 60_000);
  await service.settle();
  assert.equal(service.mark(), mark);
  jobs.due(morning + 60_000);
  const [digest] = messages(phone, await service.since(mark));
  assert.deepEqual(digest, { title: '2 tasks are due today', tag: digest.tag });
  jobs.due(morning + 120_000);
  await service.settle();
  assert.equal(service.mark(), mark + 1);
  await ben('POST', '/api/push/unsubscribe', { endpoint: phone.subscription.endpoint });
});

test('push checks again at sending time that the person can see the task', async () => {
  const phone = pushBrowser(HOST);
  await subscribe(ben, phone);
  const anasOwn = (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana) })).data.task;
  const mark = service.mark();
  jobs.notify([ids.ben], 'assigned', anasOwn.id, ids.ana, {});
  jobs.notify([ids.ben], 'comment', null, ids.ana, {});
  await service.settle();
  assert.equal(service.mark(), mark);
  await ben('POST', '/api/push/unsubscribe', { endpoint: phone.subscription.endpoint });
});

test('a dead subscription is dropped, and signing out stops pushes to that browser', async () => {
  const phone = pushBrowser(HOST);
  await subscribe(ben, phone);
  service.status = 410;
  let mark = service.mark();
  await owner('POST', '/api/tasks', { title: 'Book the venue', assigneeId: ids.ben });
  await service.since(mark);
  await service.settle(50);
  service.status = 201;
  assert.equal((await ben('GET', '/api/push')).data.devices, 0);

  // a subscription belongs to the session that made it
  const laptop = pushBrowser(HOST);
  await subscribe(ben, laptop);
  assert.equal((await ben('POST', '/api/auth/logout')).status, 200);
  mark = service.mark();
  await owner('POST', '/api/tasks', { title: 'Order chairs', assigneeId: ids.ben });
  await service.settle();
  assert.equal(service.mark(), mark);
  await ben.wallet(wallets.ben, 'login');
  assert.equal((await ben('GET', '/api/push')).data.devices, 0);

  // someone else signing in on the same browser takes the endpoint over, with fresh settings
  await subscribe(ben, laptop, { showNames: false });
  const taken = await subscribe(ana, laptop);
  assert.deepEqual(taken.data, { device: { showNames: true, timeZone: 'Europe/Stockholm' }, devices: 1 });
  assert.equal((await ben('GET', '/api/push')).data.devices, 0);
  assert.equal((await ben('POST', '/api/push/test', { endpoint: laptop.subscription.endpoint })).status, 404);

  mark = service.mark();
  assert.equal((await ana('POST', '/api/push/test', { endpoint: laptop.subscription.endpoint })).status, 200);
  const [hello] = messages(laptop, await service.since(mark));
  assert.equal(hello.title, 'Notifications are on');

  // a browser that swaps its subscription keeps its settings, but only for the same person
  await ana('PATCH', '/api/push/subscription', { endpoint: laptop.subscription.endpoint, showNames: false });
  const swapped = pushBrowser(HOST);
  assert.equal((await ben('PUT', '/api/push/subscription', { ...swapped.subscription, replaces: laptop.subscription.endpoint })).status, 404);
  const replaced = await ana('PUT', '/api/push/subscription', { ...swapped.subscription, replaces: laptop.subscription.endpoint });
  assert.deepEqual(replaced.data, { device: { showNames: false, timeZone: 'Europe/Stockholm' }, devices: 1 });
  assert.equal((await ana('POST', '/api/push/test', { endpoint: laptop.subscription.endpoint })).status, 404);

  await subscribe(ana, pushBrowser(HOST));
  assert.equal((await ana('GET', '/api/push')).data.devices, 2);
  assert.deepEqual((await ana('DELETE', '/api/push/subscriptions')).data, { device: null, devices: 0 });
});
