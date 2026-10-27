import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset, signIn, person } from './helpers/fakeBrowser.js';

// A server that shows what was before: a message slipped in late under an older key, an edited
// or deleted message as it was, or a conversation's name and settings as they were.
const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const lateUnderOldKey = await load('lib/lateUnderOldKey');
const metaHistory = await load('state/metaHistory');
const chatState = await load('state/chatState');
const chatTimeline = await load('actions/chat/chatTimeline');

const item = (id, seq, epoch, extra = {}) => ({ id, channelId: 'c', seq, threadId: null, senderId: 'v', sentAt: seq, epoch, type: 'message', edit: 0, state: 'ok', stream: 's', n: seq, text: id, files: [], mentions: [], ...extra });

beforeEach(() => {
  reset();
  signIn('v', person(), [{ id: 'v', name: 'Vic' }, { id: 'w', name: 'Wen' }]);
});

test('a message placed after one under a newer key, under an older key, went in late', () => {
  assert.deepEqual([...lateUnderOldKey([item('a', 1, 1), item('b', 2, 2), item('c', 3, 1)])], ['c']);
  // an edit is sealed again under the newest key, so an old message edited later says nothing
  assert.deepEqual([...lateUnderOldKey([item('a', 1, 2, { edit: 1 }), item('b', 2, 1)])], []);
  assert.deepEqual([...lateUnderOldKey([item('a', 1, 1), item('b', 2, 1), item('c', 3, 2)])], []);
});

test('a sender’s mark of an edit or deletion catches the older version, for their messages only', () => {
  chatState.set({ marks: { c: { 'v/s': { senderId: 'v', scopes: {}, edits: { ['m'.repeat(22)]: 2, ['d'.repeat(22)]: -1, ['w'.repeat(22)]: 5 } } } } });
  chatTimeline.local(item('m'.repeat(22), 1, 1, { edit: 1 }));
  chatTimeline.local(item('d'.repeat(22), 2, 1));
  chatTimeline.local(item('w'.repeat(22), 3, 1, { senderId: 'w' }));
  chatTimeline.local(item('n'.repeat(22), 4, 1));
  const states = Object.fromEntries(chatState.timeline('c').items.map((m) => [m.id[0], m.state]));
  assert.deepEqual(states, { m: 'unverified', d: 'unverified', w: 'ok', n: 'ok' });
});

test('a name or settings older than ones opened here, or none at all, are caught', () => {
  assert.equal(metaHistory.stale('c', 1, 100), false);
  metaHistory.record('c', 2, 200);
  assert.equal(metaHistory.stale('c', 2, 200), false);
  assert.equal(metaHistory.stale('c', 2, 150), true);
  assert.equal(metaHistory.stale('c', 1, 999), true);
  assert.equal(metaHistory.stale('c', null, null), true, 'a name that went missing');
  assert.equal(metaHistory.stale('other', null, null), false);
});
