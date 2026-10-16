import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed, { cipher } from './helpers/sealed.js';

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const ids = {};

const row = (id) => sql.get('SELECT title, description, checklist, sealed FROM tasks WHERE id = ?', id);
const detail = async (c, id) => (await c('GET', `/api/tasks/${id}/detail`)).data;

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  for (const [who, c] of [['ana', ana], ['ben', ben]]) {
    const inv = await owner('POST', '/api/invites', { role: 'member' });
    ids[who] = (await c.wallet(wallet(), 'invite', { name: who, inviteToken: inv.data.token })).data.user.id;
  }
});
after(() => srv.close());

test('a private task only exists sealed, and the server keeps no plain text for it', async () => {
  assert.equal((await ana('POST', '/api/tasks', { title: 'Propose to Mia', private: true })).status, 400);
  assert.equal((await ana('POST', '/api/tasks', { title: 'Propose to Mia', private: true, sealed: sealed(ids.ana) })).status, 400);
  assert.equal((await ana('POST', '/api/tasks', { sealed: sealed(ids.ana) })).status, 400);
  assert.equal((await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ben) })).status, 400);
  assert.equal((await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana, ids.ben) })).status, 400);
  assert.equal((await ana('POST', '/api/tasks', { private: true, sealed: { ...sealed(ids.ana), title: 'not ciphertext!' } })).status, 400);

  const seal = sealed(ids.ana);
  const made = await ana('POST', '/api/tasks', { private: true, sealed: seal, dueDate: '2026-12-24' });
  assert.equal(made.status, 200);
  ids.task = made.data.task.id;
  assert.deepEqual(made.data.task.sealed, seal);
  assert.equal(made.data.task.title, '');
  assert.deepEqual({ ...row(ids.task) }, { title: '', description: '', checklist: '[]', sealed: JSON.stringify(seal) });
  assert.equal((await owner('GET', `/api/tasks/${ids.task}/detail`)).status, 404);
});

test('plain text can’t be written into a sealed task, but its contents can be re-sealed', async () => {
  for (const patch of [{ title: 'Propose to Mia' }, { description: 'ring size 6' }, { checklist: [{ text: 'call the jeweller' }] }]) {
    assert.equal((await ana('PATCH', `/api/tasks/${ids.task}`, patch)).status, 400);
  }
  const before = (await detail(ana, ids.task)).task.sealed;
  const next = { ...sealed(ids.ana), id: before.id };
  assert.equal((await ana('PATCH', `/api/tasks/${ids.task}`, { sealed: { ...next, title: undefined } })).status, 400);
  const res = await ana('PATCH', `/api/tasks/${ids.task}`, { sealed: next, priority: 2 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.task.sealed, next);
  const history = (await detail(ana, ids.task)).activity.map((a) => a.type);
  assert.ok(history.includes('details'));
  assert.equal(JSON.stringify((await detail(ana, ids.task)).activity).includes(next.title), false);
});

test('comments on a sealed task are encrypted, never parsed and never quoted', async () => {
  assert.equal((await ana('POST', `/api/tasks/${ids.task}/comments`, { body: 'plain @ben' })).status, 400);
  const posted = await ana('POST', `/api/tasks/${ids.task}/comments`, { body: cipher(60), sealed: true });
  assert.equal(posted.status, 200);
  assert.equal(posted.data.comment.sealed, true);
  assert.equal((await ana('PATCH', `/api/comments/${posted.data.comment.id}`, { body: 'now in plain text' })).status, 400);
  assert.equal((await ana('PATCH', `/api/comments/${posted.data.comment.id}`, { body: cipher(60) })).status, 200);

  const open = (await owner('POST', '/api/tasks', { title: 'Team task' })).data.task;
  assert.equal((await owner('POST', `/api/tasks/${open.id}/comments`, { body: cipher(60), sealed: true })).status, 400);
});

test('a new assignee means a fresh key, and every comment moves to it', async () => {
  const comments = (await detail(ana, ids.task)).comments;
  assert.equal((await ana('PATCH', `/api/tasks/${ids.task}`, { assigneeId: ids.ben })).status, 400);
  const fresh = sealed(ids.ana, ids.ben);
  assert.equal((await ana('PATCH', `/api/tasks/${ids.task}`, { assigneeId: ids.ben, sealed: fresh })).status, 409);
  assert.equal((await ana('PATCH', `/api/tasks/${ids.task}`, { assigneeId: ids.ben, sealed: sealed(ids.ana, ids.owner), comments: [] })).status, 400);
  const resealed = comments.map((c) => ({ id: c.id, body: cipher(60) }));
  const res = await ana('PATCH', `/api/tasks/${ids.task}`, { assigneeId: ids.ben, sealed: fresh, comments: resealed });
  assert.equal(res.status, 200);
  const seen = await detail(ben, ids.task);
  assert.deepEqual(seen.task.sealed.keys, fresh.keys);
  assert.deepEqual(seen.comments.map((c) => c.body), resealed.map((c) => c.body));

  // bulk edits leave an encrypted task's assignee alone rather than strand its key
  assert.equal((await ana('POST', '/api/tasks/bulk', { ids: [ids.task], patch: { assigneeId: ids.ana, priority: 3 } })).status, 200);
  const after = (await detail(ana, ids.task)).task;
  assert.deepEqual([after.assigneeId, after.priority], [ids.ben, 3]);
});

test('a plain private task from before encryption gets sealed and its old words wiped', async () => {
  const legacy = (await ana('POST', '/api/tasks', { title: 'Old secret', assigneeId: ids.ben })).data.task;
  await ana('PATCH', `/api/tasks/${legacy.id}`, { title: 'Old secret, renamed' });
  await ana('POST', `/api/tasks/${legacy.id}/comments`, { body: 'Hey @ben' });
  sql.run('UPDATE tasks SET private = 1 WHERE id = ?', legacy.id);
  assert.ok(JSON.stringify(sql.all('SELECT data FROM notifications WHERE task_id = ?', legacy.id)).includes('Old secret'));

  assert.equal((await ana('PATCH', `/api/tasks/${legacy.id}`, { sealed: sealed(ids.ana, ids.ben) })).status, 409);
  const comments = (await detail(ana, legacy.id)).comments.map((c) => ({ id: c.id, body: cipher(60) }));
  assert.equal((await ana('PATCH', `/api/tasks/${legacy.id}`, { sealed: sealed(ids.ana, ids.ben), comments })).status, 200);

  const left = JSON.stringify([row(legacy.id), sql.all('SELECT * FROM activity WHERE task_id = ?', legacy.id), sql.all('SELECT * FROM notifications WHERE task_id = ?', legacy.id), sql.all('SELECT * FROM comments WHERE task_id = ?', legacy.id)]);
  for (const words of ['Old secret', 'Hey @ben']) assert.equal(left.includes(words), false, words);
});

test('opening a task up again brings its plain text back, comments included', async () => {
  const task = (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana) })).data.task;
  await ana('POST', `/api/tasks/${task.id}/comments`, { body: cipher(60), sealed: true });
  assert.equal((await ana('PATCH', `/api/tasks/${task.id}`, { private: false })).status, 400);
  const comments = (await detail(ana, task.id)).comments.map((c) => ({ id: c.id, body: 'Back in the open' }));
  const res = await ana('PATCH', `/api/tasks/${task.id}`, { private: false, title: 'Plan the party', description: 'Saturday', comments });
  assert.equal(res.status, 200);
  assert.equal(res.data.task.sealed, null);
  assert.equal((await detail(owner, task.id)).comments[0].body, 'Back in the open');
});

test('plain files, assistants and proofs stay away from what they can’t read', async () => {
  const task = (await ana('POST', '/api/tasks', { private: true, sealed: sealed(ids.ana), recurrence: 'weekly', dueDate: '2026-10-20' })).data.task;
  const upload = await fetch(`${base()}/api/tasks/${task.id}/attachments`, { method: 'POST', headers: { Cookie: ana.cookie(), 'X-NONOS': '1', 'X-Filename': 'ring.jpg', 'Content-Type': 'image/jpeg' }, body: Buffer.from('jpeg') });
  assert.equal(upload.status, 400);

  const done = await ana('PATCH', `/api/tasks/${task.id}`, { status: 'done', today: '2026-10-16' });
  assert.equal(done.status, 200);
  assert.equal(done.data.spawned.private, true);
  assert.equal(done.data.spawned.sealed.title, task.sealed.title);
  const receipt = sql.get('SELECT title, salt, body FROM receipts WHERE task_id = ?', task.id);
  assert.equal(receipt.title, null);
  assert.equal(JSON.parse(receipt.body).task.commit, null);

  const csv = (await ana('GET', '/api/export/tasks.csv')).data;
  assert.ok(csv.includes(`NON-${task.number},Private task (encrypted)`));
});
