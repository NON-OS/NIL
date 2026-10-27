import { test } from 'node:test';
import assert from 'node:assert/strict';
import chatStreams from '../src/actions/chat/chatStreams.ts';

// A server that drops, replays or reorders messages, as the receiving browser sees it: each
// sender tab numbers its messages, and the numbers have to run on without gaps, repeats or turns.
let next = 1;
const msg = (n, { stream = 'aaaaaaaaaaaaaaaa', sender = 'v', seq = next++, id = `m${seq}`, ttl = null } = {}) => ({ id, seq, n, stream, senderId: sender, state: 'ok', sentAt: 1000 * seq, expiresAt: ttl ? 1000 * seq + ttl : null });

test('an unbroken stream raises nothing', () => {
  assert.deepEqual(chatStreams([msg(1), msg(2), msg(3)], { fromStart: true }), []);
});

test('a message the server held back shows as missing, with how many', () => {
  assert.deepEqual(chatStreams([msg(1), msg(2), msg(5)], { fromStart: false }), [{ kind: 'missing', senderId: 'v', count: 2 }]);
  // the very first one, when the timeline reaches back to the start
  assert.deepEqual(chatStreams([msg(2), msg(3)], { fromStart: true }), [{ kind: 'missing', senderId: 'v', count: 1 }]);
  assert.deepEqual(chatStreams([msg(2), msg(3)], { fromStart: false }), []);
});

test('the same number twice under another id is a replay; a turned order is reordering', () => {
  assert.deepEqual(chatStreams([msg(1), msg(2), msg(2, { id: 'other' })], { fromStart: false }), [{ kind: 'replayed', senderId: 'v', count: 1 }]);
  assert.deepEqual(chatStreams([msg(1), msg(3), msg(2)], { fromStart: false }), [{ kind: 'reordered', senderId: 'v', count: 1 }]);
});

test('each tab’s stream is checked on its own, and messages that disappear leave no false alarm', () => {
  const two = [msg(1), msg(1, { stream: 'bbbbbbbbbbbbbbbb', sender: 'w' }), msg(2), msg(2, { stream: 'bbbbbbbbbbbbbbbb', sender: 'w' })];
  assert.deepEqual(chatStreams(two, { fromStart: true }), []);
  // set to disappear: the early ones are gone on purpose
  assert.deepEqual(chatStreams([msg(4, { ttl: 60_000 }), msg(5, { ttl: 60_000 })], { fromStart: true }), []);
  // a gap between two that disappear alike still counts
  assert.deepEqual(chatStreams([msg(4, { ttl: 60_000 }), msg(6, { ttl: 60_000 })], { fromStart: false }), [{ kind: 'missing', senderId: 'v', count: 1 }]);
  // messages that didn't check out, or wait to be sent, aren't counted
  assert.deepEqual(chatStreams([msg(1), { ...msg(2), state: 'unverified' }, { ...msg(3), seq: 0 }], { fromStart: true }), []);
});
