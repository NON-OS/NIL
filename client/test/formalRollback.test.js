import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Differential tests for formal/Nil/Rollback.lean. Each sequence is replayed through the real
// isRollback and taskVersions the way taskSeal.open and putTasks call them, and the warnings
// must match the model's.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/rollback.json', import.meta.url)));

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
const { default: isRollback } = await import('../src/lib/isRollback.ts');
const { default: taskVersions } = await import('../src/state/taskVersions.ts');

test('the browser warns exactly where the model does', () => {
  vectors.sequences.forEach((s, n) => {
    const task = `formal-task-${n}`;
    const warnings = s.events.map((e) => {
      if (e.held !== undefined) {
        taskVersions.record(task, Number(e.held));
        return false;
      }
      const revs = e.opened.map(Number);
      const warned = isRollback(revs, taskVersions.seen(task));
      taskVersions.record(task, Math.max(...revs));
      return warned;
    });
    assert.deepEqual(warnings, s.warnings, s.name);
  });
});

test('the vectors cover an honest server, an older revision and mixed pieces', () => {
  const names = vectors.sequences.map((s) => s.name);
  for (const name of ['honest server, revisions go up', 'older revision after a newer one', 'pieces from different revisions']) assert.ok(names.includes(name));
  assert.ok(vectors.sequences.some((s) => s.warnings.includes(true)) && vectors.sequences.some((s) => !s.warnings.includes(true)));
});
