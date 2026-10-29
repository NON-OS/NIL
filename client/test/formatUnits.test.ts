import { test } from 'node:test';
import assert from 'node:assert/strict';
import formatUnits from '../src/lib/formatUnits.ts';

test('amounts read in whole tokens with grouped thousands', () => {
  assert.equal(formatUnits('250000000000000000000', 18), '250');
  assert.equal(formatUnits('1234500000000000000000', 18), '1,234.5');
  assert.equal(formatUnits('1500000', 6, 2), '1.5');
  assert.equal(formatUnits('0', 18), '0');
});

test('a tiny amount never reads as zero', () => {
  assert.equal(formatUnits('500', 18), '<0.0001');
  assert.equal(formatUnits('500', 18, 2), '<0.01');
  assert.equal(formatUnits('-500', 18), '>-0.0001');
  assert.equal(formatUnits('500', 18, 18), '0.0000000000000005');
});
