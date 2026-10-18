import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Writes that take several statements are saved whole or not at all. Each case makes one later
// statement fail with a temporary trigger, the way a full disk or a crash would, and checks that
// nothing of the change was kept.
let srv;
let sql;
let db;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const ids = {};

before(async () => {
  srv = await startServer();
  sql = (await import('../db/sql.js')).default;
  db = (await import('../db/connection.js')).default;
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).data.user.id;
  const invite = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mo Member', inviteToken: invite.data.token })).data.user.id;
});
after(() => srv.close());

function failing(table, fn) {
  db.exec(`CREATE TEMP TRIGGER fail_${table} BEFORE INSERT ON main.${table} BEGIN SELECT RAISE(ABORT, 'the disk is full'); END`);
  return Promise.resolve()
    .then(fn)
    .finally(() => db.exec(`DROP TRIGGER temp.fail_${table}`));
}
const count = (query, ...params) => sql.get(query, ...params).n;

test('finishing a task keeps nothing when its receipt can’t be written, and its schedule stays', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Weekly report', assigneeId: ids.member, dueDate: '2026-01-05', recurrence: 'weekly' })).data.task;
  const before = { activity: count('SELECT COUNT(*) AS n FROM activity WHERE task_id = ?', task.id), tasks: count('SELECT COUNT(*) AS n FROM tasks') };
  await failing('receipts', async () => {
    assert.equal((await member('PATCH', `/api/tasks/${task.id}`, { status: 'done' })).status, 500);
  });
  const row = sql.get('SELECT status, recurrence, completed_at FROM tasks WHERE id = ?', task.id);
  assert.deepEqual({ ...row }, { status: 'todo', recurrence: 'weekly', completed_at: null });
  assert.equal(count('SELECT COUNT(*) AS n FROM activity WHERE task_id = ?', task.id), before.activity, 'no history of a change that was never made');
  assert.equal(count('SELECT COUNT(*) AS n FROM tasks'), before.tasks, 'and no next copy');

  const done = await member('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
  assert.equal(done.status, 200);
  assert.ok(done.data.spawned);
  assert.equal(count('SELECT COUNT(*) AS n FROM receipts WHERE task_id = ?', task.id), 1);
});

test('a comment whose history entry can’t be written isn’t posted, and nobody hears about it', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Venue', assigneeId: ids.member })).data.task;
  const unread = () => count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', ids.member);
  const before = unread();
  await failing('activity', async () => {
    assert.equal((await owner('POST', `/api/tasks/${task.id}/comments`, { body: '@Mo the deposit is due Friday' })).status, 500);
  });
  assert.equal(count('SELECT COUNT(*) AS n FROM comments WHERE task_id = ?', task.id), 0);
  assert.equal(unread(), before);
  assert.equal(sql.get('SELECT comment_count FROM tasks WHERE id = ?', task.id).comment_count, 0);
});

test('a vote whose notices can’t be written is never created', async () => {
  const before = count('SELECT COUNT(*) AS n FROM proposals');
  await failing('notifications', async () => {
    assert.equal((await owner('POST', '/api/proposals', { title: 'Offsite in May?', days: 3 })).status, 500);
  });
  assert.equal(count('SELECT COUNT(*) AS n FROM proposals'), before);
});

test('a change that fails one of its checks leaves the rest as it was', async () => {
  assert.equal((await member('PATCH', '/api/me', { name: 'Maurice', color: 'not a colour' })).status, 400);
  assert.equal(sql.get('SELECT name FROM users WHERE id = ?', ids.member).name, 'Mo Member');

  assert.equal((await owner('PATCH', '/api/workspace', { name: 'Renamed', taskPrefix: '***' })).status, 400);
  assert.equal(sql.get('SELECT name FROM workspace WHERE id = 1').name, 'Acme');

  // only a guest is limited to projects, so the role change asked for with it is undone too
  assert.equal((await owner('PATCH', `/api/users/${ids.member}`, { role: 'admin', projects: [] })).status, 400);
  assert.equal(sql.get('SELECT role FROM users WHERE id = ?', ids.member).role, 'member');
});

test('what waits for a commit runs after it, and a rollback drops it', () => {
  const ran = [];
  sql.tx(() => {
    sql.afterCommit(() => ran.push('first'));
    sql.tx(() => sql.afterCommit(() => ran.push('nested')));
    assert.deepEqual(ran, [], 'nothing before the commit');
  });
  assert.deepEqual(ran, ['first', 'nested']);
  assert.throws(() =>
    sql.tx(() => {
      sql.afterCommit(() => ran.push('rolled back'));
      throw new Error('no');
    }),
  );
  sql.afterCommit(() => ran.push('outside'));
  assert.deepEqual(ran, ['first', 'nested', 'outside']);
});
