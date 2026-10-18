import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, keyDirectory, keyPins, keyring, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const memberFingerprint = await load('lib/crypto/memberFingerprint');
const taskKeys = await load('actions/taskKeys');
const taskSeal = await load('actions/taskSeal');
const taskKeySeal = await load('lib/crypto/taskKeySeal');
const taskText = await load('lib/crypto/taskText');
const taskFacts = await load('lib/crypto/taskFacts');
const signedFacts = await load('lib/crypto/signedFacts');
const keyHash = await load('lib/crypto/keyHash');
const identityFromSeed = await load('lib/crypto/identityFromSeed');

const users = [{ id: 'v', name: 'Vic' }, { id: 'b', name: 'Bob' }];
const fingerprint = (id) => memberFingerprint(b64u.encode(id.publicKey), b64u.encode(id.signingKey));
beforeEach(reset);

test('confirming pins the key that was on screen, never one swapped in while comparing', async () => {
  const [V, B, S] = [person(), person(), person()];
  signIn('v', V, users);
  let bob = entry('b', B);
  route('GET', '/api/encryption-keys', () => [entry('v', V), bob]);
  const [shown] = await keyDirectory.pending(['b']);
  assert.equal(shown.fingerprint, fingerprint(B));

  // the server lists its own key for Bob, and a Docs refresh fetches the directory again
  bob = entry('b', S);
  const before = store.get().keysRev;
  await keyDirectory.sharable(['b']);
  assert.ok(store.get().keysRev > before, 'whatever shows keys redraws');
  await assert.rejects(keyDirectory.confirm([shown]), /changed while you were comparing/);
  assert.equal(keyPins.all().b.confirmed, false);
  assert.equal((await keyDirectory.sharable(['b'])).size, 0);

  // what the prompt shows now is the new key, and confirming that one is a choice made on it
  const [now] = await keyDirectory.pending(['b']);
  assert.deepEqual([now.state, now.fingerprint, now.previousFingerprint], ['changed', fingerprint(S), fingerprint(B)]);
});

test('ids alone confirm nothing', async () => {
  const [V, B] = [person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('b', B)]);
  await assert.rejects(keyDirectory.confirm(['b']));
  assert.equal(keyPins.all().b.confirmed, false);
});

test('a key for someone deactivated or not in the workspace shows up to be checked', async () => {
  const [V, B, G] = [person(), person(), person()];
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V), entry('b', B), entry('ghost', G, { active: false })]);
  assert.deepEqual((await keyDirectory.pending()).map((k) => k.userId).sort(), ['b', 'ghost']);
  await confirm(['b']);
  assert.deepEqual((await keyDirectory.pending()).map((k) => k.userId), ['ghost']);
});

test('a key seen first counts for signatures only while it can be seen, and only for an active member', async () => {
  const [V, B, G] = [person(), person(), person()];
  signIn('v', V, [...users, { id: 'gone', name: 'Gone', deactivated: true }]);
  let listed = [entry('v', V), entry('b', B), entry('ghost', G), entry('gone', G, { active: false })];
  route('GET', '/api/encryption-keys', () => listed);
  const count = async (id) => (await keyDirectory.signers(id, null)).length;
  assert.deepEqual([await count('b'), await count('ghost'), await count('gone')], [1, 0, 0]);
  // the server stops listing Bob's key, so nothing on screen shows it any more
  listed = [entry('v', V)];
  await keyDirectory.load({ fresh: true });
  assert.equal(await count('b'), 0);
  // a key this person confirmed keeps counting
  listed = [entry('v', V), entry('b', B)];
  await keyDirectory.load({ fresh: true });
  await confirm(['b']);
  listed = [entry('v', V)];
  await keyDirectory.load({ fresh: true });
  assert.equal(await count('b'), 1);
});

// A private task Bob writes for Vic with the identity he holds at that moment.
async function bobsTask(bob, at = Date.now()) {
  const k = taskKeys.fresh();
  const facts = { rev: 1, at, readers: ['b', 'v'], from: null, key: keyHash(k.key) };
  const V = keyring.identity();
  const piece = (field, text) => taskText.seal(k.key, k.id, field, signedFacts.seal(text, { kind: taskFacts.kind, place: taskFacts.place(k.id, field), facts: taskFacts.list(facts), by: 'b', signingPrivate: bob.signingPrivate }));
  return { id: k.id, title: await piece('title', 'Handover notes'), description: await piece('description', 'x'), checklist: await piece('checklist', '[]'), keys: { v: await taskKeySeal.seal(k.key, V.publicKey) } };
}

test('after a teammate resets their keys, what they signed before still opens, marked as their earlier key', async () => {
  const V = person();
  const [B1, B2] = [person(), person()];
  signIn('v', V, users);
  let bob = entry('b', B1, { createdAt: Date.now() - 60_000 });
  route('GET', '/api/encryption-keys', () => [entry('v', V), bob]);
  await confirm(['b']);
  const before = await bobsTask(B1);
  const ref = (sealed) => ({ id: 't1', creatorId: 'b', assigneeId: 'v', sealed });
  assert.equal((await taskSeal.open(ref(before))).oldKey, null);

  signIn('v', identityFromSeed(V.seed), users);
  bob = entry('b', B2);
  await keyDirectory.load({ fresh: true });
  await confirm(['b']);
  const opened = await taskSeal.open(ref(before));
  assert.deepEqual([opened.title, opened.oldKey], ['Handover notes', fingerprint(B1)]);

  // the old key can't sign anything dated after the new one was published
  await assert.rejects(taskSeal.open(ref(await bobsTask(B1, bob.createdAt + 1))), /for the people it shows/);
  assert.equal((await taskSeal.open(ref(await bobsTask(B2)))).oldKey, null);
});

test('an unconfirmed key that gets replaced isn’t kept as an earlier one', async () => {
  const [V, B1, B2] = [person(), person(), person()];
  signIn('v', V, users);
  let bob = entry('b', B1, { createdAt: Date.now() - 60_000 });
  route('GET', '/api/encryption-keys', () => [entry('v', V), bob]);
  const before = await bobsTask(B1);
  bob = entry('b', B2);
  await keyDirectory.load({ fresh: true });
  await confirm(['b']);
  assert.deepEqual(keyPins.all().b.earlier, []);
  await assert.rejects(taskSeal.open({ id: 't1', creatorId: 'b', assigneeId: 'v', sealed: before }), /for the people it shows/);
});
