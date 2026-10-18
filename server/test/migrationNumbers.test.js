import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import migrations from '../db/migrations.js';

const DIR = new URL('../db/migrations/', import.meta.url);
const NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.js$/;
// numbers taken by branches not merged yet; this empties once they are
const RESERVED = [32, 33];

const files = fs.readdirSync(DIR).sort();
const numbered = files.map((name) => ({ name, number: Number(NAME.exec(name)?.[1]) }));

test('every file in migrations/ is named NNN-words.js', () => {
  assert.deepEqual(numbered.filter((f) => !f.number).map((f) => f.name), []);
});

test('migration numbers are unique and consecutive, apart from the reserved ones', () => {
  const numbers = numbered.map((f) => f.number);
  assert.equal(new Set(numbers).size, numbers.length, 'two files share a number');
  for (const n of RESERVED) assert.ok(!numbers.includes(n), `${n} has its file now; take it off RESERVED`);
  const top = Math.max(...numbers);
  const expected = Array.from({ length: top }, (_, i) => i + 1).filter((n) => !RESERVED.includes(n));
  assert.deepEqual(numbers, expected);
});

test('each entry of migrations.js is the file whose number matches its place', async () => {
  assert.equal(migrations.length, files.length, 'migrations.js and the folder list a different number of migrations');
  for (const { name, number } of numbered) {
    const { default: step } = await import(new URL(name, DIR));
    const index = number - 1 - RESERVED.filter((n) => n < number).length;
    assert.equal(migrations[index], step, `${name} should be entry ${index + 1} of migrations.js`);
  }
});
