import { route } from './helpers/fakeTab.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import keyEntry from './helpers/keyEntry.js';
import store from '../src/state/store.ts';
import keyring from '../src/state/keyring.ts';
import sealedCache from '../src/state/sealedCache.ts';
import session from '../src/actions/session.ts';
import taskKeys from '../src/actions/taskKeys.ts';
import taskSeal from '../src/actions/taskSeal.ts';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';

const ORIGIN = 'https://nil.example';
const WSKEY = 'workspace-key-abc';
const person = () => identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
const users = [
  { id: 'v', name: 'Vic' },
  { id: 'b', name: 'Bob' },
];
const bootstrap = (over = {}) => ({ me: users[0], workspace: {}, users, projects: [], labels: [], goals: [], tasks: [], archive: { before: 0, cursor: null, done: { goals: {}, projects: {} } }, focus: [], origin: ORIGIN, workspaceKey: WSKEY, ...over });

route('POST', '/api/auth/logout', () => ({}));

beforeEach(async () => {
  await session.logout();
});

test('signing out forgets every private task this tab opened', async () => {
  const vic = person();
  route('GET', /\/api\/bootstrap/, () => bootstrap());
  await session.enter();
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
  route('GET', /\/api\/bootstrap/, () => bootstrap({ me: users[1], tasks: [card] }));
  await session.enter();
  const shown = store.get().tasks.t1;
  assert.equal(shown.locked, true);
  assert.equal(shown.title, 'Private task');
  assert.equal(shown.description, undefined);
});
