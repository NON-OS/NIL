import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Identity } from '@semaphore-protocol/identity';
import groupRoot from '../../server/votes/groupRoot.js';
import checkVoterList from '../src/lib/semaphore/checkVoterList.ts';

const members = ['a', 'b', 'c'].map((n) => ({ commitment: new Identity(`voter-list-${n}`).commitment.toString() }));
const weighted = members.map((m, i) => ({ ...m, power: String(10 * (i + 1)) }));

// The auditor's finding: the voter list came from a signed-in request, so a server could hand
// each member a tree of its own. A browser now proves from a list fetched without its cookie, and
// checks it against the roots the server takes ballots for and the ones it was shown signed in.
test('a voter list is used only if it adds up to an accepted root the signed-in view shares', () => {
  for (const [list, isWeighted] of [[members, false], [weighted, true]]) {
    const root = groupRoot(list);
    const view = { members: list, roots: [root, '42'] };
    assert.doesNotThrow(() => checkVoterList(view, ['42'], isWeighted));
    assert.doesNotThrow(() => checkVoterList(view, [root], isWeighted));
    // a list that doesn't make any root the server accepts
    assert.throws(() => checkVoterList({ members: list.slice(0, 2), roots: [root] }, [root], isWeighted), /doesn’t match the one it takes ballots for/);
    // the signed-in view was a different list from the one everyone else gets
    assert.throws(() => checkVoterList(view, ['7'], isWeighted), /different voter list/);
  }
  // a removed member's leaf is emptied in place, as on the server
  const removed = members.map((m, i) => (i === 1 ? { ...m, removed: true } : m));
  assert.doesNotThrow(() => checkVoterList({ members: removed, roots: [groupRoot(removed)] }, [groupRoot(removed)], false));
});
