import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store, keyDirectory, keyPins, entry, person, signIn, route, reset, confirm, b64u } from './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const memberFingerprint = await load('lib/crypto/memberFingerprint');

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
