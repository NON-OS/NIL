import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_URL ??= 'http://localhost:3000';
process.env.REALTIME_MAX_BUFFERED_KB ??= '64';
const { default: hub } = await import('../realtime/hub.js');

// A tab that stopped reading: what's sent to it piles up in its buffer.
function tab(bufferedAmount = 0) {
  return { OPEN: 1, readyState: 1, bufferedAmount, sent: [], terminated: false, send(d) { this.sent.push(d); }, terminate() { this.terminated = true; this.readyState = 3; }, close() {} };
}

test('a socket whose backlog passes the limit is cut off; the others still get the event', () => {
  const quiet = tab();
  const stuck = tab(65 * 1024);
  const other = tab();
  hub.add(quiet, { userId: 'u1', isAdmin: false, session: 's1' });
  hub.add(stuck, { userId: 'u1', isAdmin: false, session: 's2' });
  hub.add(other, { userId: 'u2', isAdmin: false, session: 's3' });
  hub.toUsers(['u1', 'u2', 'u1'], { type: 'docs', id: 'd' });
  assert.equal(quiet.sent.length, 1);
  assert.equal(other.sent.length, 1);
  assert.ok(stuck.terminated);
  assert.equal(stuck.sent.length, 0);
  assert.equal(hub.count('u1'), 1);
  // the same event reaches someone once per tab, encoded once for everyone
  assert.equal(quiet.sent[0], other.sent[0]);
  for (const ws of [quiet, other]) hub.remove(ws);
  assert.equal(hub.count(), 0);
});

test('nothing is encoded for people who aren’t online', () => {
  let encoded = 0;
  hub.toUsers(['nobody'], { type: 'docs', get id() { encoded++; return 'd'; } });
  assert.equal(encoded, 0);
});
