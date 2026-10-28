import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reset, signIn, person } from './helpers/fakeBrowser.js';

// Differential tests for formal/Nil/ChatHistory.lean: the edit history a browser keeps, used the
// way openMessage uses it, and the check for messages slipped in late under an older key.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/chat-history.json', import.meta.url)));
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const editHistory = await load('state/editHistory');
const lateUnderOldKey = await load('lib/lateUnderOldKey');

test('the browser refuses exactly the versions the model refuses', () => {
  reset();
  signIn('v', person(), [{ id: 'v', name: 'Vic' }]);
  vectors.edits.forEach((c, i) => {
    const id = `formal-${i}`.padEnd(22, 'x');
    const refused = c.versions.map((v) => {
      const edit = Number(v.edit);
      if (editHistory.stale(id, edit, v.deleted)) return true;
      editHistory.record(id, edit, v.deleted);
      return false;
    });
    assert.deepEqual(refused, c.refused, c.name);
  });
});

test('the browser finds exactly the late messages the model finds', () => {
  for (const c of vectors.late) {
    const items = c.messages.map((m, i) => ({ id: `m${i}`, seq: i + 1, epoch: Number(m.epoch), edit: m.edited ? 1 : 0, state: 'ok' }));
    const late = lateUnderOldKey(items);
    assert.deepEqual(items.map((m) => late.has(m.id)), c.late, c.name);
  }
});

test('the vectors include the cases the proofs are about', () => {
  const names = vectors.edits.map((c) => c.name);
  assert.ok(names.includes('edited, then deleted, then the edit again'));
  assert.deepEqual(vectors.edits.find((c) => c.name === 'edited, then deleted, then the edit again').refused, [false, false, true]);
  assert.ok(vectors.late.some((c) => c.late.includes(true)) && vectors.late.some((c) => !c.late.includes(true)));
});
