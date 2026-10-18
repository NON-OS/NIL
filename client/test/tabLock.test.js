import { route } from './helpers/fakeTab.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import keyEntry from './helpers/keyEntry.js';
import wallet from '../../server/test/helpers/wallet.js';
import store from '../src/state/store.ts';
import keyring from '../src/state/keyring.ts';
import keyPins from '../src/state/keyPins.ts';
import sealedCache from '../src/state/sealedCache.ts';
import taskVersions from '../src/state/taskVersions.ts';
import session from '../src/actions/session.ts';
import keyDirectory from '../src/actions/keyDirectory.ts';
import docs from '../src/actions/docs.ts';
import taskKeys from '../src/actions/taskKeys.ts';
import taskSeal from '../src/actions/taskSeal.ts';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import docKeySeal from '../src/lib/crypto/docKeySeal.ts';
import docText from '../src/lib/crypto/docText.ts';
import signedText from '../src/lib/crypto/signedText.ts';

const ORIGIN = 'https://nil.example';
const WSKEY = 'workspace-key-abc';
const person = () => identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
const users = [
  { id: 'v', name: 'Vic' },
  { id: 'b', name: 'Bob' },
];
const bootstrap = (over = {}) => ({ me: users[0], workspace: {}, users, projects: [], labels: [], goals: [], tasks: [], archive: { before: 0, cursor: null, done: { goals: {}, projects: {} } }, focus: [], origin: ORIGIN, workspaceKey: WSKEY, ...over });
const enter = async (over) => {
  route('GET', /\/api\/bootstrap/, () => bootstrap(over));
  await session.enter();
};
const notices = () => store.get().toasts.map((t) => t.message).join('\n');

route('POST', '/api/auth/logout', () => ({}));

beforeEach(async () => {
  await session.logout();
});

test('the first workspace a browser sees raises no warning about its pins', async () => {
  await enter();
  assert.equal(notices(), '');
});

test('signing out forgets every private task this tab opened', async () => {
  const vic = person();
  await enter();
  keyring.unlock(vic);
  route('GET', '/api/encryption-keys', () => [keyEntry('v', vic)]);
  const fresh = taskKeys.fresh();
  const sealed = await taskSeal.seal({ title: 'Therapy appointment', description: 'Tue 5pm', checklist: [] }, fresh, await taskKeys.wrap(fresh.key, ['v']), 1);
  assert.equal(sealedCache.get(sealed)?.title, 'Therapy appointment');

  await session.logout();
  assert.equal(keyring.identity(), null);
  assert.equal(sealedCache.get(sealed), undefined);

  // the next person to sign in at this computer is handed that task's card
  const card = { id: 't1', number: 1, private: true, sealed: { id: sealed.id, title: sealed.title, checklist: sealed.checklist, keys: sealed.keys } };
  await enter({ me: users[1], tasks: [card] });
  const shown = store.get().tasks.t1;
  assert.equal(shown.locked, true);
  assert.equal(shown.title, 'Private task');
  assert.equal(shown.description, undefined);
});

test('a bootstrap naming another workspace key locks the keys instead of moving the pins', async () => {
  const vic = person();
  const bob = person();
  await enter();
  keyring.unlock(vic);
  route('GET', '/api/encryption-keys', () => [keyEntry('v', vic), keyEntry('b', bob)]);
  await keyDirectory.load({ fresh: true });
  await keyDirectory.confirm(['b']);
  taskVersions.record('t1', 4);

  // a reconnect brings a bootstrap with another workspace key and a key the server made for Bob
  const stand = person();
  route('GET', '/api/encryption-keys', () => [keyEntry('b', stand, { workspaceKey: 'switched', signer: wallet() })]);
  await enter({ workspaceKey: 'switched' });
  assert.equal(keyring.identity(), null);
  assert.match(notices(), /switched this tab to another workspace or account/);

  // so a doc the server signed as Bob with that key doesn't open, and the tab won't unlock again
  const K = crypto.getRandomValues(new Uint8Array(32));
  const at = (field) => ({ docId: 'd9', field, version: 3 });
  const forged = (field, text) => docText.seal(K, at(field), signedText.seal(text, { context: docText.context(at(field)), by: 'b', signingPrivate: stand.signingPrivate }));
  route('GET', '/api/docs/d9', async () => ({ doc: { id: 'd9', version: 3, audience: 'people', titleCt: await forged('title', 'Payment details'), bodyCt: await forged('body', 'New IBAN: XX00 EVIL'), wrappedKey: await docKeySeal.seal(K, vic.publicKey), createdBy: 'b', updatedBy: 'b', createdAt: 1, updatedAt: 2, readers: ['v', 'b'] } }));
  await assert.rejects(docs.open('d9'), /Unlock/);
  assert.throws(() => keyring.unlock(person()), /Reload the page/);
  assert.equal(keyring.identity(), null);

  // a fresh start under the real workspace key finds Bob's confirmed key and the revision record
  await session.logout();
  await enter();
  assert.deepEqual(keyPins.all().b?.confirmed, true);
  assert.equal(taskVersions.seen('t1'), 4);
});

test('a switched tab files no pins, so the warning still shows after a reload', async () => {
  const vic = person();
  await enter();
  keyring.unlock(vic);
  route('GET', '/api/encryption-keys', () => [keyEntry('v', vic)]);
  await keyDirectory.load({ fresh: true });

  await enter({ workspaceKey: 'switched-again' });
  route('GET', '/api/encryption-keys', () => [keyEntry('b', person(), { workspaceKey: 'switched-again' })]);
  await keyDirectory.load({ fresh: true });
  await keyDirectory.confirm(['b']);
  assert.deepEqual(keyPins.all(), {});

  await session.logout();
  await enter({ workspaceKey: 'switched-again' });
  assert.deepEqual(keyPins.all(), {});
  assert.match(notices(), /but none for this one/);
});

test('a bootstrap naming another account or site locks the keys too', async () => {
  for (const over of [{ me: users[1] }, { origin: 'https://other.example' }, { me: null }]) {
    await session.logout();
    await enter();
    keyring.unlock(person());
    await enter(over);
    assert.equal(keyring.identity(), null, JSON.stringify(over));
    assert.match(notices(), /switched this tab/);
  }
});

test('an unlock that finishes after the tab was switched is refused', async () => {
  await enter();
  // the wallet is still signing when a reconnect names another workspace key
  await enter({ workspaceKey: 'switched' });
  assert.match(notices(), /switched this tab/);
  assert.throws(() => keyring.unlock(person()), /Reload the page/);
  assert.equal(keyring.identity(), null);
});

test('an unlock that finishes after sign-out is refused', async () => {
  assert.equal(store.get().me, null);
  assert.throws(() => keyring.unlock(person()), /Sign in/);
  assert.equal(keyring.identity(), null);
});

test('a reconnect that names the same workspace and account keeps the keys', async () => {
  const vic = person();
  await enter();
  keyring.unlock(vic);
  await enter();
  await enter();
  assert.equal(keyring.identity(), vic);
  assert.equal(notices(), '');
});

test('pins that started over while this browser kept others raise a warning', async () => {
  const vic = person();
  await enter();
  keyring.unlock(vic);
  route('GET', '/api/encryption-keys', () => [keyEntry('v', vic)]);
  await keyDirectory.load({ fresh: true });
  assert.ok(Object.keys(keyPins.all()).length > 0);

  // after a reload, the server names a workspace key this browser has no pins for
  await session.logout();
  await enter({ workspaceKey: 'never-seen-here' });
  assert.match(notices(), /keys saved for another workspace or account, but none for this one/);
  // once per sign-in, not on every reconnect
  store.set({ toasts: [] });
  await enter({ workspaceKey: 'never-seen-here' });
  assert.equal(notices(), '');

  await session.logout();
  await enter();
  assert.equal(notices(), '');
});
