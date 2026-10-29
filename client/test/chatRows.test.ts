import { test } from 'node:test';
import assert from 'node:assert/strict';
import chatRows from '../src/lib/chatRows.ts';
import type ChatItem from '../src/types/ChatItem.ts';

const T = Date.UTC(2026, 9, 29, 9);
const msg = (id: string, seq: number, senderId: string, at: number, extra: Partial<ChatItem> = {}): ChatItem => ({
  id, channelId: 'c', seq, threadId: null, senderId, sentAt: T + at, epoch: 1, type: 'message', reaction: false, text: id, files: [], mentions: [],
  emoji: null, target: null, edit: 0, editedAt: null, replies: 0, lastReplyAt: null, expiresAt: null, stream: 's', n: seq, state: 'ok', ...extra,
});
const kinds = (rows: ReturnType<typeof chatRows>) => rows.map((r) => (r.kind === 'message' ? `${r.item.id}${r.grouped ? '+' : ''}` : r.kind));

test('one person writing within minutes is grouped under one name', () => {
  const rows = chatRows([msg('a', 1, 'u1', 0), msg('b', 2, 'u1', 60_000), msg('c', 3, 'u2', 90_000)], { me: 'u1', readSeq: 3 });
  assert.deepEqual(kinds(rows), ['day', 'a', 'b+', 'c']);
});

test('the New line sits above the first unread message from someone else', () => {
  const rows = chatRows([msg('a', 1, 'u2', 0), msg('b', 2, 'u2', 60_000), msg('c', 3, 'u2', 90_000)], { me: 'u1', readSeq: 1 });
  assert.deepEqual(kinds(rows), ['day', 'a', 'unread', 'b', 'c+']);
});

test('in a thread the root stands apart, with the count of replies under it', () => {
  const items = [msg('r', 1, 'u1', 0), msg('x', 2, 'u1', 30_000, { threadId: 'r' }), msg('y', 3, 'u2', 60_000, { threadId: 'r' })];
  const rows = chatRows(items, { me: 'u1', readSeq: Number.MAX_SAFE_INTEGER, root: 'r' });
  assert.deepEqual(kinds(rows), ['day', 'r', 'replies', 'x', 'y']);
  assert.equal(rows.find((r) => r.kind === 'replies')?.kind === 'replies' && (rows.find((r) => r.kind === 'replies') as { count: number }).count, 2);
});

test('a reaction is gathered onto its message, not shown as a row', () => {
  const rows = chatRows([msg('a', 1, 'u1', 0), msg('re', 2, 'u2', 1000, { type: 'reaction', reaction: true, emoji: '🎉', target: 'a' })], { me: 'u1', readSeq: 2 });
  assert.deepEqual(kinds(rows), ['day', 'a']);
  const a = rows[1];
  assert.ok(a.kind === 'message' && a.reactions[0].emoji === '🎉' && a.reactions[0].people[0] === 'u2');
});
