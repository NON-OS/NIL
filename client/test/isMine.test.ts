import { test } from 'node:test';
import assert from 'node:assert/strict';
import isMine from '../src/lib/isMine.ts';
import type Task from '../src/types/Task.ts';

const task = (assigneeId: string | null, creatorId: string | null) => ({ assigneeId, creatorId }) as Task;

test('a task assigned to you is yours, whoever made it', () => {
  assert.equal(isMine(task('me', 'someone'), 'me'), true);
  assert.equal(isMine(task('me', null), 'me'), true);
});

test('a task you made without an assignee is yours', () => {
  assert.equal(isMine(task(null, 'me'), 'me'), true);
});

test('a task you handed to someone else is theirs, and nobody owns an unassigned task someone else made', () => {
  assert.equal(isMine(task('someone', 'me'), 'me'), false);
  assert.equal(isMine(task(null, 'someone'), 'me'), false);
  assert.equal(isMine(task(null, null), 'me'), false);
});
