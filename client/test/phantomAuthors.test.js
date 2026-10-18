import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { keyDirectory, entry, person, signIn, route, reset, confirm, sealedCache } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const taskKeys = await load('actions/taskKeys');
const taskSeal = await load('actions/taskSeal');
const sealedPatch = await load('actions/sealedPatch');
const taskKeySeal = await load('lib/crypto/taskKeySeal');
const taskText = await load('lib/crypto/taskText');
const taskFacts = await load('lib/crypto/taskFacts');
const signedText = await load('lib/crypto/signedText');
const signedFacts = await load('lib/crypto/signedFacts');
const taskRevision = await load('lib/crypto/taskRevision');
const keyHash = await load('lib/crypto/keyHash');

const users = [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }];
const randomKey = () => crypto.getRandomValues(new Uint8Array(32));
let V, W, G;

beforeEach(() => {
  reset();
  [V, W, G] = [person(), person(), person()];
});

// What a server holding its own identity G can make: words under a key it chose, signed by G.
async function forgedTask(K, { by = 'ghost', readers = ['v', 'w'], older = false } = {}) {
  const sid = 'server-seal';
  const facts = { rev: 5, at: Date.now(), readers, from: null, key: keyHash(K) };
  const piece = (field, text) =>
    taskText.seal(K, sid, field, older
      ? taskRevision.add(signedText.seal(text, { context: taskText.context(sid, field, 5), by, signingPrivate: G.signingPrivate }), 5)
      : signedFacts.seal(text, { kind: taskFacts.kind, place: taskFacts.place(sid, field), facts: taskFacts.list(facts), by, signingPrivate: G.signingPrivate }));
  return { id: sid, title: await piece('title', 'Q4 vendor contract'), description: await piece('description', 'Negotiate'), checklist: await piece('checklist', '[]'), keys: { w: await taskKeySeal.seal(K, W.publicKey) } };
}

test('a private task signed by a key the server made doesn’t open, whatever it claims', async () => {
  signIn('w', W, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W), entry('ghost', G, { active: false })]);
  await confirm(['v']);
  const K = randomKey();
  const shown = (sealed, creatorId = 'v') => ({ id: 't1', creatorId, assigneeId: 'w', sealed });
  // the older format, signed by a ghost that's neither creator nor assignee
  await assert.rejects(taskSeal.open(shown(await forgedTask(K, { older: true }))), /for the people it shows/);
  // format 2, with the ghost outside the readers it names
  await assert.rejects(taskSeal.open(shown(await forgedTask(K))), /for the people it shows/);
  // format 2, with the ghost as the creator the server shows: its key is one nobody can vouch for
  await assert.rejects(taskSeal.open(shown(await forgedTask(K, { readers: ['ghost', 'w'] }), 'ghost')), /for the people it shows/);
  // and Wen's next edit is never sealed under the server's key
  const task = { ...shown(await forgedTask(K)), number: 1, private: true, locked: false, title: 'Q4 vendor contract', description: 'Negotiate', checklist: [] };
  await assert.rejects(sealedPatch(task, { description: 'Max budget 250k' }), /for the people it shows/);
});

test('genuine words moved under a key of the server’s don’t open, so an edit can’t go to that key', async () => {
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('w', W)]);
  await confirm(['w']);
  const fresh = taskKeys.fresh();
  const honest = await taskSeal.seal({ title: 'Merger', description: 'Talks on Friday', checklist: [] }, fresh, await taskKeys.wrap(fresh.key, ['v', 'w']), { rev: 2, readers: ['v', 'w'] });
  // a former reader working with the server re-encrypts Vic's signed words under a new key
  const K = randomKey();
  const move = async (field) => taskText.seal(K, honest.id, field, await taskText.open(fresh.key, honest.id, field, honest[field]));
  const moved = { ...honest, title: await move('title'), description: await move('description'), checklist: await move('checklist'), keys: { w: await taskKeySeal.seal(K, W.publicKey) } };
  signIn('w', W, users);
  await confirm(['v']);
  await assert.rejects(taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'w', sealed: moved }), /for the people it shows/);
  sealedCache.clear();
  const genuine = await taskSeal.open({ id: 't1', creatorId: 'v', assigneeId: 'w', sealed: honest });
  assert.deepEqual([genuine.title, genuine.by, genuine.readers], ['Merger', 'v', ['v', 'w']]);
});

test('a teammate’s key seen first counts for their words only while the notice can show it', async () => {
  let listed = [entry('v', V), entry('w', W)];
  route('GET', '/api/encryption-keys', () => listed);
  signIn('v', V, users);
  const fresh = taskKeys.fresh();
  const sealed = await taskSeal.seal({ title: 'Plan', description: '', checklist: [] }, fresh, { w: await taskKeySeal.seal(fresh.key, W.publicKey) }, { rev: 1, readers: ['v', 'w'] });
  signIn('w', W, users);
  const ref = { id: 't1', creatorId: 'v', assigneeId: 'w', sealed };
  assert.equal((await taskSeal.open(ref)).title, 'Plan');
  // the server stops listing Vic's key, so nothing on screen shows it any more
  sealedCache.clear();
  listed = [entry('w', W)];
  await keyDirectory.load({ fresh: true });
  await assert.rejects(taskSeal.open(ref), /for the people it shows/);
});
