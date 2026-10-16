import { test } from 'node:test';
import assert from 'node:assert/strict';
import challengeTable from '../auth/challengeTable.js';
import clientKey from '../auth/clientKey.js';

test('the challenge table is bounded per client and in total', () => {
  const table = challengeTable({ ttlMs: 60_000, max: 10, perClient: 3 });
  const flood = Array.from({ length: 5 }, () => table.issue('wallet', {}, 'attacker'));
  const mine = table.issue('wallet', { who: 'me' }, 'victim');
  // one client asking again and again only pushes out its own oldest challenges
  assert.equal(table.take(flood[0], 'wallet'), null);
  assert.equal(table.take(flood[1], 'wallet'), null);
  assert.equal(table.size, 4);
  assert.deepEqual(table.take(mine, 'wallet'), { who: 'me' });

  // past the global cap the oldest anywhere goes first, and the table never grows beyond it
  const ids = Array.from({ length: 12 }, (_, i) => table.issue('wallet', { i }, `client-${i}`));
  assert.equal(table.size, 10);
  assert.equal(table.take(flood[2], 'wallet'), null);
  assert.deepEqual(table.take(ids.at(-1), 'wallet'), { i: 11 });
  // single use, and bound to its purpose
  assert.equal(table.take(ids.at(-1), 'wallet'), null);
  assert.equal(table.take(ids.at(-2), 'vote'), null);
});

test('an IPv6 /64 counts as one client, and IPv4 through a dual-stack socket as itself', () => {
  assert.equal(clientKey('2001:db8:1:2:aaaa::1'), clientKey('2001:db8:1:2:bbbb:cccc:dddd:eeee'));
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
  assert.equal(clientKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(clientKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(clientKey('203.0.113.9'), '203.0.113.9');
});
