import { test } from 'node:test';
import assert from 'node:assert/strict';
import countOf from '../src/lib/countOf.ts';
import serverCountOf from '../../server/lib/countOf.js';

test('a count takes the singular only for one', () => {
  assert.equal(countOf(1, 'task'), '1 task');
  assert.equal(countOf(0, 'task'), '0 tasks');
  assert.equal(countOf(5, 'task'), '5 tasks');
  assert.equal(countOf(1, 'person', 'people'), '1 person');
  assert.equal(countOf(2, 'person', 'people'), '2 people');
  assert.equal(countOf(1200, 'token'), `${(1200).toLocaleString()} tokens`);
});

test('the server words counts the same way', () => {
  assert.equal(serverCountOf(1, 'request'), '1 request');
  assert.equal(serverCountOf(3, 'person', 'people'), '3 people');
});
