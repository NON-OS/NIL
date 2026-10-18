import { route } from './helpers/fakeTab.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import keyEntry from './helpers/keyEntry.js';
import store from '../src/state/store.ts';
import keyring from '../src/state/keyring.ts';
import sealedCache from '../src/state/sealedCache.ts';
import revealTask from '../src/state/revealTask.ts';
import taskKeys from '../src/actions/taskKeys.ts';
import taskSeal from '../src/actions/taskSeal.ts';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';

const ann = identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
store.set({ phase: 'ready', origin: 'https://nil.example', workspaceKey: 'workspace-key-abc', me: { id: 'a', name: 'Ann' }, users: { a: { id: 'a', name: 'Ann' } } });
keyring.unlock(ann);
route('GET', '/api/encryption-keys', () => [keyEntry('a', ann)]);

test('a version this tab opened before still warns when the server goes back to it', async () => {
  const key = taskKeys.fresh();
  const keys = await taskKeys.wrap(key.key, ['a']);
  const v1 = await taskSeal.seal({ title: 'Pay vendor', description: 'Pay 1,000', checklist: [] }, key, keys, { rev: 1, readers: ['a', null] });
  const v2 = await taskSeal.seal({ title: 'Pay vendor', description: 'Don’t pay, the invoice is fraud', checklist: [] }, key, keys, { rev: 2, readers: ['a', null] });
  const task = (sealed) => ({ id: 't1', creatorId: 'a', assigneeId: null, sealed });
  // as if both versions came from the server rather than from this tab
  sealedCache.clear();
  assert.equal((await taskSeal.open(task(v1))).rollback, false);
  assert.equal((await taskSeal.open(task(v2))).rollback, false);

  const back = await taskSeal.open(task(v1));
  assert.equal(back.description, 'Pay 1,000');
  assert.equal(back.rollback, true);

  // a card for the old version, shown straight from what the tab opened before
  const card = revealTask(task({ ...v1, description: undefined }));
  assert.equal(card.locked, false);
  assert.equal(card.rolledBack, true);
  assert.equal('rollback' in card || 'rev' in card, false);
  assert.equal(revealTask(task({ ...v2, description: undefined })).rolledBack, false);
  // still only for the people the words were sealed for
  assert.equal(revealTask({ ...task({ ...v1, description: undefined }), assigneeId: 'm' }).locked, true);
});
