import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
let calendar;
let recurrenceRule;
let zonedTime;
const base = () => srv.base;
const owner = client(base);
const STOCKHOLM = 'Europe/Stockholm';

before(async () => {
  srv = await startServer();
  calendar = (await import('../lib/calendar.js')).default;
  recurrenceRule = (await import('../lib/recurrenceRule.js')).default;
  zonedTime = (await import('../lib/zonedTime.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

const activity = async (id) => (await owner('GET', `/api/tasks/${id}/detail`)).data.activity.map((a) => a.type);

test('a due time is stored as a moment in UTC, and the zone it was set in stays on the server', async () => {
  const res = await owner('POST', '/api/tasks', { title: 'Call the bank', dueDate: '2026-10-20', dueTime: '15:00', timeZone: STOCKHOLM });
  assert.equal(res.status, 200);
  const task = res.data.task;
  assert.equal(task.dueDate, '2026-10-20');
  assert.equal(task.dueAt, Date.UTC(2026, 9, 20, 13, 0));
  // teammates see when it's due, not where the person who set it is
  assert.equal(JSON.stringify((await owner('GET', '/api/bootstrap')).data).includes('Stockholm'), false);
  assert.equal(JSON.stringify((await owner('GET', `/api/tasks/${task.id}/detail`)).data).includes('Stockholm'), false);
  assert.equal((await owner('POST', '/api/tasks', { title: 'Plain', dueDate: '2026-10-20' })).data.task.dueAt, null);

  for (const bad of [
    { dueDate: '2026-10-20', dueTime: '15:00' },
    { dueTime: '15:00', timeZone: STOCKHOLM },
    { dueDate: '2026-10-20', dueTime: '25:00', timeZone: STOCKHOLM },
    { dueDate: '2026-10-20', dueTime: '7pm', timeZone: STOCKHOLM },
    { dueDate: '2026-10-20', dueTime: '15:00', timeZone: 'Nowhere/Land' },
    { dueDate: '2026-10-20', dueTime: '15:00', timeZone: '../../etc' },
  ]) {
    assert.equal((await owner('POST', '/api/tasks', { title: 'Bad', ...bad })).status, 400, JSON.stringify(bad));
  }
});

test('moving the date keeps the wall-clock time where it was set, across daylight saving', async () => {
  const { task } = (await owner('POST', '/api/tasks', { title: 'Dentist', dueDate: '2026-10-20', dueTime: '15:00', timeZone: STOCKHOLM })).data;
  // clocks go back on October 25, so 15:00 in Stockholm is 14:00 UTC by November
  const moved = (await owner('PATCH', `/api/tasks/${task.id}`, { dueDate: '2026-11-03' })).data.task;
  assert.equal(moved.dueAt, Date.UTC(2026, 10, 3, 14, 0));
  assert.deepEqual((await activity(task.id)).filter((t) => t.startsWith('due')), ['dueDate']);

  const retimed = (await owner('PATCH', `/api/tasks/${task.id}`, { dueTime: '09:30', timeZone: 'America/New_York' })).data.task;
  assert.equal(retimed.dueAt, Date.UTC(2026, 10, 3, 14, 30));
  assert.equal(retimed.dueDate, '2026-11-03');
  assert.deepEqual((await activity(task.id)).filter((t) => t.startsWith('due')), ['dueDate', 'dueAt']);

  const untimed = (await owner('PATCH', `/api/tasks/${task.id}`, { dueTime: null })).data.task;
  assert.deepEqual([untimed.dueDate, untimed.dueAt], ['2026-11-03', null]);
  await owner('PATCH', `/api/tasks/${task.id}`, { dueTime: '08:00', timeZone: STOCKHOLM });
  const cleared = (await owner('PATCH', `/api/tasks/${task.id}`, { dueDate: null })).data.task;
  assert.deepEqual([cleared.dueDate, cleared.dueAt], [null, null]);
  // the stored zone goes with the time, so a later date alone stays a date
  assert.equal((await owner('PATCH', `/api/tasks/${task.id}`, { dueDate: '2026-12-01' })).data.task.dueAt, null);

  // bulk rescheduling keeps each task's time too
  const { task: other } = (await owner('POST', '/api/tasks', { title: 'Standup', dueDate: '2026-10-20', dueTime: '10:00', timeZone: STOCKHOLM })).data;
  const bulk = await owner('POST', '/api/tasks/bulk', { ids: [other.id], patch: { dueDate: '2026-10-27' } });
  assert.equal(bulk.data.tasks[0].dueAt, Date.UTC(2026, 9, 27, 9, 0));
});

test('repeats take rules beyond the presets, stored in one form', async () => {
  const stored = async (recurrence) => {
    const res = await owner('POST', '/api/tasks', { title: 'Repeat me', dueDate: '2026-10-16', recurrence });
    return res.status === 200 ? res.data.task.recurrence : res.status;
  };
  assert.equal(await stored('FREQ=DAILY;INTERVAL=3'), 'FREQ=DAILY;INTERVAL=3');
  assert.equal(await stored('FREQ=WEEKLY;INTERVAL=2'), 'biweekly');
  assert.equal(await stored('INTERVAL=2;FREQ=WEEKLY'), 'biweekly');
  assert.equal(await stored('FREQ=MONTHLY;INTERVAL=1'), 'monthly');
  assert.equal(await stored('FREQ=MONTHLY;BYMONTHDAY=15'), 'FREQ=MONTHLY;BYMONTHDAY=15');
  assert.equal(await stored('FREQ=YEARLY'), 'FREQ=YEARLY');
  for (const preset of ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly']) assert.equal(await stored(preset), preset);
  for (const bad of ['FREQ=HOURLY', 'FREQ=DAILY;INTERVAL=0', 'FREQ=DAILY;INTERVAL=400', 'FREQ=WEEKLY;BYMONTHDAY=3', 'FREQ=MONTHLY;BYMONTHDAY=32', 'FREQ=DAILY;COUNT=3', 'FREQ=DAILY;FREQ=WEEKLY', 'every day', 'FREQ=DAILY;']) {
    assert.equal(await stored(bad), 400, bad);
  }
});

test('finishing a repeating task schedules the next by its rule, at the same wall-clock time', async () => {
  const complete = async (id, today) => (await owner('PATCH', `/api/tasks/${id}`, { status: 'done', today })).data.spawned;

  const { task } = (await owner('POST', '/api/tasks', { title: 'Team call', dueDate: '2026-10-20', dueTime: '09:00', timeZone: STOCKHOLM, recurrence: 'FREQ=DAILY;INTERVAL=7' })).data;
  const next = await complete(task.id, '2026-10-19');
  assert.deepEqual([next.dueDate, next.dueAt, next.recurrence], ['2026-10-27', Date.UTC(2026, 9, 27, 8, 0), 'FREQ=DAILY;INTERVAL=7']);

  const { task: rent } = (await owner('POST', '/api/tasks', { title: 'Rent', dueDate: '2026-10-03', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=15' })).data;
  const first = await complete(rent.id, '2026-10-01');
  assert.equal(first.dueDate, '2026-10-15');
  assert.equal((await complete(first.id, '2026-10-01')).dueDate, '2026-11-15');

  const { task: close } = (await owner('POST', '/api/tasks', { title: 'Month end', dueDate: '2027-01-31', recurrence: 'FREQ=MONTHLY;BYMONTHDAY=-1' })).data;
  const feb = await complete(close.id, '2027-01-01');
  assert.equal(feb.dueDate, '2027-02-28');
  assert.equal((await complete(feb.id, '2027-01-01')).dueDate, '2027-03-31');
});

test('calendar math for rules and presets', () => {
  const cases = [
    ['2026-01-31', 'monthly', '2026-02-28'],
    ['2026-02-28', 'monthly', '2026-03-28'],
    ['2026-12-15', 'monthly', '2027-01-15'],
    ['2026-10-16', 'weekdays', '2026-10-19'],
    ['2026-10-16', 'biweekly', '2026-10-30'],
    ['2026-10-16', 'FREQ=DAILY;INTERVAL=3', '2026-10-19'],
    ['2026-10-16', 'FREQ=WEEKLY;INTERVAL=3', '2026-11-06'],
    ['2026-10-16', 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31', '2026-10-31'],
    ['2026-10-31', 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31', '2026-12-31'],
    ['2026-02-10', 'FREQ=MONTHLY;BYMONTHDAY=30', '2026-02-28'],
    ['2026-02-28', 'FREQ=MONTHLY;BYMONTHDAY=30', '2026-03-30'],
    ['2026-11-20', 'FREQ=MONTHLY;INTERVAL=3', '2027-02-20'],
    ['2028-02-29', 'FREQ=YEARLY', '2029-02-28'],
  ];
  for (const [from, rule, want] of cases) assert.equal(calendar.next(from, rule), want, `${from} ${rule}`);
  assert.equal(calendar.next('2026-10-16', 'FREQ=SECONDLY'), null);
  assert.equal(recurrenceRule.normalize('BYMONTHDAY=1;FREQ=MONTHLY'), 'FREQ=MONTHLY;BYMONTHDAY=1');
  assert.equal(recurrenceRule.normalize('FREQ=DAILY'), 'daily');
  assert.equal(recurrenceRule.normalize('freq=daily'), null);
});

test('wall-clock times survive daylight saving jumps in both directions', () => {
  // Stockholm skips 02:00 to 03:00 on March 29, 2026, and repeats 02:00 to 03:00 on October 25
  assert.equal(zonedTime.toUtc('2026-03-29', '02:30', STOCKHOLM), Date.UTC(2026, 2, 29, 1, 30));
  assert.deepEqual(zonedTime.wallClock(Date.UTC(2026, 2, 29, 1, 30), STOCKHOLM), { date: '2026-03-29', time: '03:30' });
  assert.equal(zonedTime.toUtc('2026-10-25', '02:30', STOCKHOLM), Date.UTC(2026, 9, 25, 0, 30));
  assert.equal(zonedTime.toUtc('2026-10-16', '00:00', 'Pacific/Kiritimati'), Date.UTC(2026, 9, 15, 10, 0));
  assert.equal(zonedTime.toUtc('2026-10-16', '23:45', 'Asia/Kathmandu'), Date.UTC(2026, 9, 16, 18, 0));
  assert.deepEqual(zonedTime.wallClock(Date.UTC(2026, 9, 16, 13, 0), 'Asia/Kolkata'), { date: '2026-10-16', time: '18:30' });
});
