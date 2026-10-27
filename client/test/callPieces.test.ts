import { test } from 'node:test';
import assert from 'node:assert/strict';
import linkQuality from '../src/lib/calls/linkQuality.ts';
import bitrateFor from '../src/lib/calls/bitrateFor.ts';
import callClock from '../src/lib/calls/callClock.ts';
import callTitle from '../src/lib/calls/callTitle.ts';

test('connection quality goes down with loss, delay and jitter, and says nothing before there is anything to measure', () => {
  assert.equal(linkQuality({ rtt: null, lost: 0, received: 0, jitter: null }), null);
  assert.equal(linkQuality({ rtt: 0.05, lost: 0, received: 500, jitter: 0.004 }), 'good');
  assert.equal(linkQuality({ rtt: 0.35, lost: 0, received: 500, jitter: 0.004 }), 'fair');
  assert.equal(linkQuality({ rtt: 0.05, lost: 25, received: 475, jitter: 0.004 }), 'fair');
  assert.equal(linkQuality({ rtt: 0.05, lost: 60, received: 440, jitter: 0.004 }), 'poor');
  assert.equal(linkQuality({ rtt: 0.9, lost: 0, received: 500, jitter: 0 }), 'poor');
});

test('each copy of a camera gets less as the call grows, never below a floor, and a screen gets more', () => {
  const cams = [1, 2, 3, 5, 7].map((n) => bitrateFor(n, 'camera'));
  assert.deepEqual([...cams].sort((a, b) => b - a), cams);
  assert.ok(cams.every((b) => b >= 250_000));
  for (const n of [1, 3, 5]) assert.ok(bitrateFor(n, 'screen') >= bitrateFor(n, 'camera'));
  assert.equal(bitrateFor(0, 'camera'), bitrateFor(1, 'camera'));
});

test('a call reads its time and its name the way people say them', () => {
  assert.equal(callClock(0), '0:00');
  assert.equal(callClock(247_900), '4:07');
  assert.equal(callClock(3_729_000), '1:02:09');
  const users = { a: { name: 'Ada' }, b: { name: 'Ben' }, c: { name: 'Cy' } } as any;
  const view = { id: 'x', kind: 'person', projectId: null, startedBy: 'a', startedAt: 0, members: [{ userId: 'a', session: 's', joinedAt: 0 }], ringing: ['b', 'c'] } as const;
  assert.equal(callTitle({ ...view, members: [...view.members], ringing: [...view.ringing] }, 'a', users, {}), 'Call with Ben and Cy');
  assert.equal(callTitle({ ...view, members: [...view.members], ringing: ['a'] }, 'b', users, {}), 'Call with Ada');
  assert.equal(callTitle({ ...view, kind: 'project', projectId: 'p', members: [], ringing: [] }, 'a', users, { p: { name: 'Launch' } } as any), 'Launch call');
});
