import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// The purge erases a few rows per transaction and lets the event loop run between batches, so a
// large workspace's first sweep can't hold the server for minutes. Tiny batches here make a
// handful of rows take many of them.
let srv;
let sql;
let purge;
let retention;
const base = () => srv.base;
const owner = client(base);
const DAY = 86_400_000;
const LONG_AGO = Date.now() - 400 * DAY;
const ids = {};

before(async () => {
  srv = await startServer({ env: { PURGE_BATCH_ROWS: '3', PURGE_BATCH_TASKS: '2', PURGE_BATCH_PAUSE_MS: '1' } });
  sql = (await import('../db/sql.js')).default;
  purge = (await import('../jobs/purge.js')).default;
  retention = (await import('../services/retention.js')).default;
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' })).data.user.id;
});
after(() => srv.close());

const count = (query, ...params) => sql.get(query, ...params).n;
const left = (tasks) => count('SELECT COUNT(*) AS n FROM tasks WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(tasks));
const keepAll = () => retention.set({ doneDays: 0, commentDays: 0, activityDays: 0 });

// tasks finished long ago, each with a comment, as a sweep finds them
async function finished(prefix, n) {
  const tasks = [];
  for (let i = 0; i < n; i++) {
    const t = (await owner('POST', '/api/tasks', { title: `${prefix} finished ${i}` })).data.task;
    await owner('POST', `/api/tasks/${t.id}/comments`, { body: `${prefix} comment ${i}` });
    await owner('PATCH', `/api/tasks/${t.id}`, { status: 'done' });
    tasks.push(t.id);
  }
  sql.run('UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id IN (SELECT value FROM json_each(?))', LONG_AGO, LONG_AGO, JSON.stringify(tasks));
  return tasks;
}

test('a sweep erases everything expired in many small batches, answering requests between them', async () => {
  const tasks = await finished('Batchy', 7);
  const open = (await owner('POST', '/api/tasks', { title: 'Batchy still open' })).data.task.id;
  for (let i = 0; i < 10; i++) await owner('POST', `/api/tasks/${open}/comments`, { body: `Batchy note ${i}` });
  sql.run('UPDATE comments SET created_at = ? WHERE task_id = ? AND id IN (SELECT id FROM comments WHERE task_id = ? ORDER BY created_at LIMIT 7)', LONG_AGO, open, open);
  for (let i = 0; i < 11; i++) sql.run("INSERT INTO activity (task_id, actor_id, type, data, created_at) VALUES (?, ?, 'status', '{}', ?)", open, ids.owner, LONG_AGO);
  retention.set({ doneDays: 30, commentDays: 30, activityDays: 30 });

  let turns = 0;
  const ticker = setInterval(() => turns++, 0);
  let sweeping = true;
  const sweep = purge().then(() => (sweeping = false));
  const answered = [];
  while (sweeping) {
    const { status } = await owner('GET', '/api/auth/state');
    if (sweeping) answered.push(status);
  }
  await sweep;
  clearInterval(ticker);
  keepAll();

  assert.equal(left(tasks), 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM comments WHERE task_id = ?', open), 3);
  assert.equal(sql.get('SELECT comment_count FROM tasks WHERE id = ?', open).comment_count, 3);
  assert.equal(count('SELECT COUNT(*) AS n FROM activity WHERE created_at < ?', Date.now() - 30 * DAY), 0);
  // four batches of tasks, three of comments and four of history, with a pause between each
  assert.ok(turns >= 5, `the event loop ran ${turns} times during the sweep`);
  assert.ok(answered.length > 0 && answered.every((s) => s === 200), `answered during the sweep: ${answered}`);
});

test('the search index matches what is left after a comment sweep', async () => {
  const t = (await owner('POST', '/api/tasks', { title: 'Quarterly offsite' })).data.task.id;
  await owner('POST', `/api/tasks/${t}/comments`, { body: 'the zanzibarvenue is booked' });
  await owner('POST', `/api/tasks/${t}/comments`, { body: 'catering by kestrelfoods' });
  sql.run("UPDATE comments SET created_at = ? WHERE body = 'the zanzibarvenue is booked'", LONG_AGO);
  const titles = async (q) => (await owner('GET', `/api/search?q=${q}`)).data.tasks.map((x) => x.title);
  assert.deepEqual(await titles('zanzibarvenue'), ['Quarterly offsite']);

  retention.set({ commentDays: 30 });
  await purge();
  keepAll();
  assert.deepEqual(await titles('zanzibarvenue'), []);
  assert.deepEqual(await titles('kestrelfoods'), ['Quarterly offsite']);
  assert.equal(count("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'task_search_%'"), 6, 'the index triggers are back');
});

test('a sweep stopped halfway keeps what it erased, and the next one finishes the job', async () => {
  const tasks = await finished('Halfway', 6);
  retention.set({ doneDays: 30 });
  const stop = new AbortController();
  // the shutdown signal arrives once the first batch has committed
  setTimeout(() => stop.abort(), 0);
  await purge(stop.signal);
  const after = left(tasks);
  assert.ok(after > 0 && after < tasks.length, `${after} of ${tasks.length} left after the stop`);
  await purge();
  keepAll();
  assert.equal(left(tasks), 0);
});

test('two sweeps asked for at once take turns', async () => {
  const order = [];
  await Promise.all([purge().then(() => order.push('first')), purge().then(() => order.push('second'))]);
  assert.deepEqual(order, ['first', 'second']);
});
