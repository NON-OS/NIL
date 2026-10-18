import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, sent } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const taskKeys = await load('actions/taskKeys');
const taskSeal = await load('actions/taskSeal');
const commentText = await load('actions/commentText');
const detail = await load('actions/detail');
const putTask = await load('state/putTask');
const openSealed = await load('actions/openSealed');
const taskText = await load('lib/crypto/taskText');
const signedText = await load('lib/crypto/signedText');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
let V, W, task, key;

beforeEach(async () => {
  reset();
  [V, W] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  key = taskKeys.fresh();
  const sealed = await taskSeal.seal({ title: 'Offsite', description: '', checklist: [] }, key, await taskKeys.wrap(key.key, ['v', 'w']), { rev: 1, readers: ['v', 'w'] });
  putTask({ id: 't1', number: 1, creatorId: 'v', assigneeId: 'w', private: true, sealed, status: 'todo', labels: [], createdAt: 1, updatedAt: 1 });
  await openSealed();
  task = store.get().tasks.t1;
});

// Posts a comment through the app and returns it as the server stored it.
async function post(body) {
  let stored;
  route('POST', '/api/tasks/t1/comments', (url, b) => ((stored = { id: b.id, taskId: 't1', authorId: 'v', body: b.body, sealed: true, createdAt: 1, editedAt: null }), { comment: stored }));
  await detail.comment('t1', body);
  return stored;
}

test('a comment is signed for its own id, so the server can’t swap two comments by the same person', async () => {
  const first = await post('Book the venue');
  const second = await post('Cancel the venue');
  assert.match(first.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal((await commentText.open(task, first)).body, 'Book the venue');
  const swapped = await commentText.open(task, { ...first, body: second.body });
  assert.deepEqual([swapped.locked, swapped.body], [true, '']);
  // nor move it onto another task or under someone else's name
  assert.equal((await commentText.open({ ...task, id: 't2' }, first)).locked, true);
  assert.equal((await commentText.open(task, { ...first, authorId: 'w' })).locked, true);
});

test('an edit is numbered, so the text from before it shows as older', async () => {
  const original = await post('Budget is 10k');
  const opened = await commentText.open(task, original);
  let edited;
  route('PATCH', `/api/comments/${original.id}`, (url, b) => ((edited = { ...original, body: b.body, editedAt: 2 }), { comment: edited }));
  store.set({ detail: { taskId: 't1', loading: false, comments: [opened], activity: [], attachments: [], watchers: [] } });
  await detail.editComment(opened, 'Budget is 4k');
  const now = await commentText.open(task, edited);
  assert.deepEqual([now.body, now.edit, now.stale], ['Budget is 4k', 1, null]);
  const back = await commentText.open(task, original);
  assert.deepEqual([back.body, back.stale], ['Budget is 10k', 'older']);
});

test('a comment deleted here and served again doesn’t come back as if nothing happened', async () => {
  const gone = await post('Wrong channel, sorry');
  route('DELETE', `/api/comments/${gone.id}`, () => ({ ok: true }));
  await detail.deleteComment({ ...gone, body: 'Wrong channel, sorry' });
  assert.ok(sent.some((r) => r.method === 'DELETE'));
  const again = await commentText.open(task, gone);
  assert.deepEqual([again.locked, again.stale, again.body], [true, 'deleted', '']);
});

test('a comment signed by someone other than its author says who signed it', async () => {
  const own = await post('Venue booked');
  assert.equal((await commentText.open(task, own)).sealedBy, null);
  // Wen's plain comment, sealed by Vic as the task turned private
  const plain = { id: 'c-plain-from-wen', taskId: 't1', authorId: 'w', body: 'I can do Friday', sealed: false, createdAt: 1, editedAt: null };
  const moved = { ...plain, sealed: true, body: await commentText.move(task, plain, key) };
  const opened = await commentText.open(task, moved);
  assert.deepEqual([opened.body, opened.sealedBy], ['I can do Friday', 'v']);
});

test('a comment in the older format still opens, marked as such', async () => {
  const json = signedText.seal('From before', { context: 'nil/comment/t1/w', by: 'w', signingPrivate: W.signingPrivate });
  const old = { id: 'c-old', taskId: 't1', authorId: 'w', sealed: true, body: await taskText.seal(key.key, key.id, 'comment', json), createdAt: 1, editedAt: null };
  const opened = await commentText.open(task, old);
  assert.deepEqual([opened.body, opened.olderFormat, opened.locked], ['From before', true, false]);
});
