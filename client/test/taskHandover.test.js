import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, entry, person, signIn, route, reset, confirm, sent, sealedCache } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const taskKeys = await load('actions/taskKeys');
const taskSeal = await load('actions/taskSeal');
const taskHandover = await load('actions/taskHandover');
const sealedPatch = await load('actions/sealedPatch');
const revealTask = await load('state/revealTask');
const putTask = await load('state/putTask');
const openSealed = await load('actions/openSealed');
const taskKeySeal = await load('lib/crypto/taskKeySeal');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }, { id: 'm', name: 'Admin' }, { id: 'z', name: 'Zed' }];
const card = (sealed, extra = {}) => ({ id: 't1', number: 1, creatorId: 'v', assigneeId: 'w', private: true, sealed, status: 'todo', labels: [], updatedAt: 1, createdAt: 1, ...extra });
const patches = () => sent.filter((r) => r.method === 'PATCH');

let V, W, M, Z;
beforeEach(() => {
  reset();
  [V, W, M, Z] = [person(), person(), person(), person()];
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W), entry('m', M), entry('z', Z)]);
});

// Vic's private task for Wen, sealed while Wen's key wasn't confirmed yet, so only Vic holds a copy.
async function vicsTask(holders = ['v']) {
  const fresh = taskKeys.fresh();
  const sealed = await taskSeal.seal({ title: 'Salary review for Wen', description: 'Raise to 140k', checklist: [] }, fresh, await taskKeys.wrap(fresh.key, holders), { rev: 1, readers: ['v', 'w'] });
  return { sealed, key: fresh.key };
}

test('handover never wraps a task key to someone the server adds as assignee', async () => {
  signIn('v', V, users);
  await confirm(['w', 'm']);
  const { sealed } = await vicsTask(['v', 'w']);
  // the server shows the very same seal with its own member as the assignee
  putTask(card(sealed, { assigneeId: 'm' }));
  assert.equal(store.get().tasks.t1.locked, true);
  store.set((s) => ({ tasks: { t1: { ...s.tasks.t1, locked: false, title: 'Salary review for Wen', checklist: [] } } }));
  await taskHandover();
  assert.equal(patches().length, 0);
  await assert.rejects(taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'm', sealed }), /for the people it shows/);
});

test('handover still gives the key to a reader the writer named, once their key is confirmed', async () => {
  signIn('v', V, users);
  const { sealed, key } = await vicsTask();
  putTask(card(sealed));
  route('PATCH', '/api/tasks/t1', (url, body) => ({ task: card(body.sealed) }));
  await taskHandover();
  assert.equal(patches().length, 0);
  await confirm(['w']);
  await taskHandover();
  const [sentPatch] = patches();
  assert.deepEqual(Object.keys(sentPatch.body.sealed.keys).sort(), ['v', 'w']);
  assert.deepEqual(await taskKeySeal.open(sentPatch.body.sealed.keys.w, W.privateKey, W.publicKey), key);
});

test('a reassignment seals to the signed creator and the new assignee only', async () => {
  signIn('v', V, users);
  await confirm(['w', 'z']);
  const { sealed } = await vicsTask(['v', 'w']);
  putTask(card(sealed));
  route('GET', '/api/tasks/t1/detail', () => ({ comments: [], attachments: [] }));
  const body = await sealedPatch(store.get().tasks.t1, { assigneeId: 'z' });
  assert.deepEqual(Object.keys(body.sealed.keys).sort(), ['v', 'z']);
  const words = await taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'z', sealed: body.sealed });
  assert.deepEqual([words.readers, words.from], [['v', 'z'], null]);
});

test('an assignee who hands a task on is named as such, and the next edit leaves their key behind', async () => {
  // Wen, the assignee, gives Vic's task to Zed
  signIn('v', V, users);
  await confirm(['w']);
  const { sealed } = await vicsTask(['v', 'w']);
  signIn('w', W, users);
  await confirm(['v', 'z']);
  putTask(card(sealed));
  await openSealed();
  route('GET', '/api/tasks/t1/detail', () => ({ comments: [], attachments: [] }));
  const handed = (await sealedPatch(store.get().tasks.t1, { assigneeId: 'z' })).sealed;
  assert.deepEqual(Object.keys(handed.keys).sort(), ['v', 'z']);

  // Zed opens it: written by Wen, who handed it on
  signIn('z', Z, users);
  const words = await taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'z', sealed: handed });
  assert.deepEqual([words.by, words.from, words.title], ['w', 'w', 'Salary review for Wen']);

  // Zed's first edit moves the task to a key Wen never saw
  await confirm(['v']);
  putTask(card(handed, { assigneeId: 'z' }));
  await openSealed();
  assert.equal(store.get().tasks.t1.handedOnBy, 'w');
  const edit = (await sealedPatch(store.get().tasks.t1, { description: 'Raise to 150k' })).sealed;
  assert.notEqual(edit.id, handed.id);
  assert.deepEqual(Object.keys(edit.keys).sort(), ['v', 'z']);
  const after = await taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'z', sealed: edit });
  assert.deepEqual([after.by, after.from, after.description], ['z', null, 'Raise to 150k']);
});

test('a copy of the task for its assignee alone still opens, since nobody new joined it', async () => {
  signIn('v', V, users);
  const { sealed } = await vicsTask(['v']);
  // the next copy of a recurring task finished by Wen belongs to Wen
  const words = await taskSeal.open({ id: 't2', creatorId: 'w', assigneeId: 'w', sealed });
  assert.equal(words.title, 'Salary review for Wen');
  sealedCache.clear();
  await assert.rejects(taskSeal.open({ id: 't2', creatorId: 'w', assigneeId: 'm', sealed }), /for the people it shows/);
});

test('a task card from the server only opens from this tab’s memory for the people its words name', async () => {
  signIn('v', V, users);
  const { sealed } = await vicsTask(['v']);
  assert.equal(revealTask(card(sealed)).locked, false);
  assert.equal(revealTask(card(sealed, { creatorId: 'm' })).locked, true);
  assert.equal(revealTask(card(sealed, { creatorId: null })).locked, false);
});
