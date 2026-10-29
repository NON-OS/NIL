import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import chatStreams from '../src/actions/chat/chatStreams.ts';

// Differential tests for formal/Nil/ChatStreams.lean. Each case is a timeline the server might
// deliver, honest or not, with the marks it served; the browser's notices must be the model's.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/chat-streams.json', import.meta.url)));
const KIND = { missing: 0, replayed: 1, reordered: 2 };
const order = (a, b) => KIND[a.kind] - KIND[b.kind] || (a.senderId < b.senderId ? -1 : a.senderId > b.senderId ? 1 : 0);

const item = (i) => {
  const sentAt = 1_000_000 + Number(i.seq) * 1000;
  return { id: `m${i.id}`, seq: Number(i.seq), n: Number(i.n), stream: `s${i.stream}`, senderId: `u${i.sender}`, state: 'ok', threadId: null, sentAt, expiresAt: i.ttl === null ? null : sentAt + Number(i.ttl) * 1000 };
};

test('the browser raises exactly the notices the model does', () => {
  for (const c of vectors.cases) {
    const marks = Object.fromEntries(c.marks.map((m) => [`u${m.sender}/s${m.stream}`, { senderId: `u${m.sender}`, scopes: { main: { n: Number(m.n), until: m.until === null ? null : Number(m.until) } } }]));
    const got = chatStreams(c.items.map(item), { fromStart: c.fromStart, marks, now: Number(c.now) }).sort(order);
    const want = c.notices.map((x) => ({ kind: x.kind, senderId: `u${x.sender}`, count: Number(x.count) })).sort(order);
    assert.deepEqual(got, want, c.name);
  }
});

test('the vectors reach every kind of notice, and silence', () => {
  const kinds = new Set(vectors.cases.flatMap((c) => c.notices.map((x) => x.kind)));
  for (const k of Object.keys(KIND)) assert.ok(kinds.has(k), k);
  assert.ok(vectors.cases.filter((c) => !c.notices.length).length > 20);
  assert.deepEqual(vectors.cases.find((c) => c.name === 'an honest server').notices, []);
});
