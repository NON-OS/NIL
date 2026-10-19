import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';

let srv;
const base = () => srv.base;
const owner = client(base);
const ben = client(base);
const ids = {};
const PER_HOUR = 8;

// Calendar apps send no cookie, only the link.
const fetchFeed = async (url) => {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
};
const events = (ics) => ics.replace(/\r\n /g, '').split('BEGIN:VEVENT').slice(1).map((block) => block.split('END:VEVENT')[0]);

before(async () => {
  srv = await startServer({ env: { CALENDAR_FEED_PER_HOUR: String(PER_HOUR) } });
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ben = (await ben.wallet(wallet(), 'invite', { name: 'Ben', inviteToken: inv.data.token })).data.user.id;
});
after(() => srv.close());

test('the feed lists your open tasks with a due date, and a private task only as "Private task"', async () => {
  assert.deepEqual((await ben('GET', '/api/me/calendar-feed')).data, { enabled: true, feed: null });
  const made = (await ben('POST', '/api/me/calendar-feed')).data.feed;
  assert.match(made.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/calendar\/[\w-]{43}\.ics$/);
  // shown again whenever Settings asks, without the server storing the link itself
  assert.equal((await ben('GET', '/api/me/calendar-feed')).data.feed.url, made.url);

  const longTitle = `Réviser le budget, ligne par ligne; ${'é'.repeat(60)} fin`;
  const shown = [
    (await owner('POST', '/api/tasks', { title: 'Ship v2, final; really', assigneeId: ids.ben, dueDate: '2026-10-20' })).data.task,
    (await owner('POST', '/api/tasks', { title: 'Call Ana', assigneeId: ids.ben, dueDate: '2026-10-21', dueTime: '15:00', timeZone: 'Europe/Stockholm' })).data.task,
    (await owner('POST', '/api/tasks', { title: longTitle, assigneeId: ids.ben, dueDate: '2026-10-23' })).data.task,
    // made by Ben for nobody in particular, which counts as his own
    (await ben('POST', '/api/tasks', { title: 'Book the room', dueDate: '2026-10-24' })).data.task,
  ];
  const secret = (await ben('POST', '/api/tasks', { private: true, sealed: sealed(ids.ben), assigneeId: ids.ben, dueDate: '2026-10-22' })).data.task;
  const done = (await owner('POST', '/api/tasks', { title: 'Already finished', assigneeId: ids.ben, dueDate: '2026-10-20', status: 'done' })).data.task;
  const trashed = (await owner('POST', '/api/tasks', { title: 'Trashed one', assigneeId: ids.ben, dueDate: '2026-10-20' })).data.task;
  await owner('DELETE', `/api/tasks/${trashed.id}`);
  await owner('POST', '/api/tasks', { title: 'Someday maybe', assigneeId: ids.ben });
  await owner('POST', '/api/tasks', { title: 'Not Ben’s', assigneeId: ids.owner, dueDate: '2026-10-20' });
  await owner('POST', '/api/tasks', { title: 'Nobody’s yet', dueDate: '2026-10-20' });

  const feed = await fetchFeed(made.url);
  assert.equal(feed.status, 200);
  assert.equal(feed.type, 'text/calendar; charset=utf-8');
  assert.ok(feed.text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(feed.text.endsWith('END:VCALENDAR\r\n'));
  for (const line of feed.text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);

  const all = events(feed.text);
  assert.equal(all.length, 5);
  for (const absent of [done, trashed]) assert.equal(feed.text.includes(absent.id), false);
  assert.equal(/Someday|Not Ben|Nobody|Already finished|Trashed/.test(feed.text), false);
  assert.ok(all.some((e) => e.includes(`UID:${shown[3].id}@`)));

  const [dated, timed, long] = shown.map((t) => all.find((e) => e.includes(`UID:${t.id}@127.0.0.1`)));
  assert.match(dated, /SUMMARY:Ship v2\\, final\\; really\r\n/);
  assert.match(dated, /DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021\r\n/);
  assert.match(dated, new RegExp(`DESCRIPTION:NON-${shown[0].number}\\\\n${srv.base.replace(/[.:/]/g, '\\$&')}/\\?task=${shown[0].number}`));
  assert.match(timed, /DTSTART:20261021T130000Z\r\n/);
  assert.equal(timed.includes('VALUE=DATE'), false);
  assert.ok(long.includes(`SUMMARY:Réviser le budget\\, ligne par ligne\\; ${'é'.repeat(60)} fin`));

  const hidden = all.find((e) => e.includes(`UID:${secret.id}@`));
  assert.match(hidden, /SUMMARY:Private task\r\n/);
  assert.match(hidden, /CLASS:PRIVATE\r\n/);
  assert.match(hidden, /DTSTART;VALUE=DATE:20261022\r\n/);
  for (const detail of ['DESCRIPTION', 'URL', '?task=', `NON-${secret.number}`]) assert.equal(hidden.includes(detail), false, detail);
});

test('a new link replaces the old one at once, and turning it off ends it', async () => {
  const first = (await ben('GET', '/api/me/calendar-feed')).data.feed.url;
  const second = (await ben('POST', '/api/me/calendar-feed')).data.feed.url;
  assert.notEqual(first, second);
  assert.equal((await fetchFeed(first)).status, 404);
  assert.equal((await fetchFeed(second)).status, 200);

  // a link the server didn't make, or one that was edited, opens nothing
  const token = second.match(/([\w-]{43})\.ics$/)[1];
  const flipped = `${token.slice(0, 5)}${token[5] === 'A' ? 'B' : 'A'}${token.slice(6)}`;
  assert.equal((await fetchFeed(second.replace(token, flipped))).status, 404);
  assert.equal((await fetchFeed(second.replace(token, 'x'.repeat(43)))).status, 404);
  assert.equal((await fetchFeed(`${srv.base}/api/calendar/nothing.ics`)).status, 404);
  // a cookie doesn't open a feed either: only the link does
  assert.equal((await ben('GET', '/api/calendar/nothing.ics')).status, 404);

  assert.deepEqual((await ben('DELETE', '/api/me/calendar-feed')).data, { enabled: true, feed: null });
  assert.equal((await fetchFeed(second)).status, 404);

  // removing someone's access closes their feed too
  const third = (await ben('POST', '/api/me/calendar-feed')).data.feed.url;
  assert.equal((await fetchFeed(third)).status, 200);
  await owner('PATCH', `/api/users/${ids.ben}`, { deactivated: true });
  assert.equal((await fetchFeed(third)).status, 404);
});

test('each link can only be fetched so often', async () => {
  const url = (await owner('POST', '/api/me/calendar-feed')).data.feed.url;
  const statuses = [];
  for (let i = 0; i <= PER_HOUR; i++) statuses.push((await fetchFeed(url)).status);
  assert.deepEqual(statuses, [...Array(PER_HOUR).fill(200), 429]);
  // other links keep working
  const next = (await owner('POST', '/api/me/calendar-feed')).data.feed.url;
  assert.equal((await fetchFeed(next)).status, 200);
});
