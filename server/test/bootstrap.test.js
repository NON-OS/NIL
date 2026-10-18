import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed from './helpers/sealed.js';

const DAY = 86_400_000;
// a tiny window, so a handful of finished tasks is enough to fill it and spill into the archive
const RECENT = 3;

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const guest = client(base);
const ids = {};

const cards = async (c) => (await c('GET', '/api/bootstrap?tasks=cards')).data;
const archive = async (c, query) => (await c('GET', `/api/tasks/archive?${new URLSearchParams(query)}`)).data;
const touch = (id, at) => sql.run('UPDATE tasks SET updated_at = ?, completed_at = CASE WHEN status = ? THEN ? END WHERE id = ?', at, 'done', at, id);

before(async () => {
  srv = await startServer({ env: { RECENT_CLOSED_DAYS: '30', RECENT_CLOSED_MAX: String(RECENT) } });
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.ana = (await ana.wallet(wallet(), 'invite', { name: 'Ana', inviteToken: inv.data.token })).data.user.id;
  ids.project = (await owner('POST', '/api/projects', { name: 'Launch' })).data.project.id;
  ids.other = (await owner('POST', '/api/projects', { name: 'Hiring' })).data.project.id;
  ids.goal = (await owner('POST', '/api/goals', { title: 'Ship v4' })).data.goal.id;
  ids.label = (await owner('POST', '/api/labels', { name: 'ops' })).data.label.id;
  const ginv = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.project] });
  ids.guest = (await guest.wallet(wallet(), 'invite', { name: 'Gus', inviteToken: ginv.data.token })).data.user.id;
});
after(() => srv.close());

test('bootstrap sends plain tasks as cards: no notes or checklist, just step counts', async () => {
  const { task } = (
    await owner('POST', '/api/tasks', {
      title: 'Write the launch post',
      description: 'A long story about why we built it. '.repeat(50),
      checklist: [{ text: 'Outline', done: true }, { text: 'Draft' }, { text: 'Edit' }],
      projectId: ids.project,
    })
  ).data;
  ids.open = task.id;

  const card = (await cards(owner)).tasks.find((t) => t.id === task.id);
  assert.equal(card.title, 'Write the launch post');
  assert.deepEqual(card.steps, { done: 1, total: 3 });
  assert.equal('description' in card, false);
  assert.equal('checklist' in card, false);

  // the open task still gets everything, and the full shape counts its steps the same way
  const full = (await owner('GET', `/api/tasks/${task.id}/detail`)).data.task;
  assert.equal(full.checklist.length, 3);
  assert.ok(full.description.startsWith('A long story'));
  assert.deepEqual(full.steps, { done: 1, total: 3 });

  // a client that doesn't ask for cards gets every task in full, as before
  const legacy = (await owner('GET', '/api/bootstrap')).data;
  assert.equal(legacy.archive, undefined);
  assert.ok(legacy.tasks.find((t) => t.id === task.id).description.startsWith('A long story'));
  assert.ok('build' in legacy);
});

test('with pool payouts off, bootstrap says nothing about a team pool to anyone', async () => {
  for (const who of [owner, ana, guest]) {
    const { privacyPools, ...rest } = (await who('GET', '/api/bootstrap')).data;
    assert.equal(privacyPools, false);
    assert.doesNotMatch(JSON.stringify(rest), /privacy ?pool|relayer|entrypoint|association set/i);
  }
});

test('one malformed row costs its own step count, not everyone’s bootstrap', async () => {
  const { task } = (await owner('POST', '/api/tasks', { title: 'Imported from elsewhere', checklist: [{ text: 'One' }] })).data;
  sql.run("UPDATE tasks SET checklist = 'not json' WHERE id = ?", task.id);
  const boot = await owner('GET', '/api/bootstrap?tasks=cards');
  assert.equal(boot.status, 200);
  assert.deepEqual(boot.data.tasks.find((t) => t.id === task.id).steps, { done: 0, total: 0 });
  await owner('DELETE', `/api/tasks/${task.id}`);
});

test('a sealed card keeps its encrypted title, checklist and keys, but not its encrypted notes', async () => {
  const seal = sealed(ids.ana);
  const { task } = (await ana('POST', '/api/tasks', { private: true, sealed: seal })).data;
  const card = (await cards(ana)).tasks.find((t) => t.id === task.id);
  assert.deepEqual(card.sealed, { id: seal.id, title: seal.title, checklist: seal.checklist, keys: seal.keys });
  assert.equal(card.steps, null);
  assert.equal((await ana('GET', `/api/tasks/${task.id}/detail`)).data.task.sealed.description, seal.description);
  // and nobody else's bootstrap, cards or archive, mentions it
  assert.equal((await cards(owner)).tasks.some((t) => t.id === task.id), false);
});

test('older finished tasks wait in the archive and come back a page at a time, newest first', async () => {
  const now = Date.now();
  const done = [];
  for (let i = 0; i < 7; i++) {
    const { task } = (await owner('POST', '/api/tasks', { title: `Finished thing ${i}`, status: i === 6 ? 'canceled' : 'done', projectId: ids.project, goalId: i < 4 ? ids.goal : null, labels: [ids.label] })).data;
    done.push(task.id);
  }
  // spread them out: two recent, then older ones, the last two past the 30-day window
  const ages = [1, 2, 5, 6, 7, 40, 41];
  done.forEach((id, i) => touch(id, now - ages[i] * DAY));

  const boot = await cards(owner);
  const inBoot = new Set(boot.tasks.map((t) => t.id));
  assert.ok(inBoot.has(ids.open), 'open work always comes along');
  assert.deepEqual(done.filter((id) => inBoot.has(id)), done.slice(0, RECENT), 'only the newest finished tasks load with the app');
  assert.ok(boot.archive.cursor);
  assert.equal(boot.archive.before, now - ages[RECENT - 1] * DAY);
  // progress still counts archived work: three archived done tasks in the project, one on the goal
  assert.equal(boot.archive.done.projects[ids.project], 3);
  assert.equal(boot.archive.done.goals[ids.goal], 1);

  const first = await archive(owner, { before: boot.archive.before, cursor: boot.archive.cursor, limit: 2 });
  assert.deepEqual(first.tasks.map((t) => t.id), done.slice(3, 5));
  assert.equal('description' in first.tasks[0], false);
  const second = await archive(owner, { before: boot.archive.before, cursor: first.cursor, limit: 2 });
  assert.deepEqual(second.tasks.map((t) => t.id), done.slice(5, 7));
  assert.equal(second.cursor, null);

  const summary = (await owner('GET', `/api/tasks/archive/summary?before=${boot.archive.before}&labels=1`)).data;
  assert.equal(summary.labels[ids.label], 4);
  assert.deepEqual(summary.done, boot.archive.done);

  assert.equal((await owner('GET', '/api/tasks/archive')).status, 400);
  assert.equal((await owner('GET', `/api/tasks/archive?before=${boot.archive.before}&cursor=bogus`)).status, 400);
});

test('views find archived tasks by search, number, id and due date', async () => {
  const boot = await cards(owner);
  const at = { before: boot.archive.before };
  const old = (await archive(owner, { ...at, limit: 1000 })).tasks;
  const target = old.find((t) => t.title === 'Finished thing 5');
  sql.run('UPDATE tasks SET due_date = ? WHERE id = ?', '2026-03-14', target.id);

  assert.deepEqual((await archive(owner, { ...at, q: 'thing 5' })).tasks.map((t) => t.id), [target.id]);
  assert.deepEqual((await archive(owner, { ...at, q: `NON-${target.number}` })).tasks.map((t) => t.id), [target.id]);
  assert.deepEqual((await archive(owner, { ...at, q: '100%_off' })).tasks, []);
  assert.deepEqual((await archive(owner, { ...at, number: target.number })).tasks.map((t) => t.id), [target.id]);
  assert.deepEqual((await archive(owner, { ...at, ids: [target.id, ids.open].join(',') })).tasks.map((t) => t.id), [target.id], 'open tasks aren’t archived');
  assert.deepEqual((await archive(owner, { ...at, dueFrom: '2026-03-01', dueTo: '2026-03-31' })).tasks.map((t) => t.id), [target.id]);
});

test('a finished task with a bounty still owed never goes to the archive', async () => {
  const { task } = (await owner('POST', '/api/tasks', { title: 'Paid work', status: 'done' })).data;
  sql.run("UPDATE tasks SET bounty = '100', updated_at = ? WHERE id = ?", Date.now() - 90 * DAY, task.id);
  assert.ok((await cards(owner)).tasks.some((t) => t.id === task.id));
  sql.run("UPDATE tasks SET bounty_state = 'paid' WHERE id = ?", task.id);
  assert.equal((await cards(owner)).tasks.some((t) => t.id === task.id), false);
});

test('the archive shows a guest only the projects shared with them', async () => {
  const { task } = (await owner('POST', '/api/tasks', { title: 'Offer letter for Sam', status: 'done', projectId: ids.other })).data;
  touch(task.id, Date.now() - 60 * DAY);
  const boot = await cards(guest);
  const all = (await archive(guest, { before: boot.archive.before, limit: 1000 })).tasks;
  assert.ok(all.length > 0);
  assert.ok(all.every((t) => t.projectId === ids.project));
  assert.deepEqual((await archive(guest, { before: boot.archive.before, ids: task.id })).tasks, []);
  assert.equal(boot.archive.done.projects[ids.other], undefined);
});

test('the live connection names the build, and everyone who may see a task gets the same push', async () => {
  const { default: socket } = await import('./helpers/socket.js');
  const a = await socket(srv.base, owner.cookie());
  const b = await socket(srv.base, ana.cookie());
  const hello = a.events.find((e) => e.type === 'hello');
  assert.ok(hello && 'build' in hello);
  await owner('PATCH', `/api/tasks/${ids.open}`, { priority: 3 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const seen = (s) => s.events.find((e) => e.type === 'task' && e.task.id === ids.open);
  assert.deepEqual(seen(a), seen(b));
  assert.equal(seen(a).task.priority, 3);
  a.close();
  b.close();
});
