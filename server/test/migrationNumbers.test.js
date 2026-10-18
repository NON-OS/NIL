import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import migrations from '../db/migrations.js';

const DIR = new URL('../db/migrations/', import.meta.url);
const NAME = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.js$/;

const files = fs.readdirSync(DIR).sort();
const numbered = files.map((name) => ({ name, number: Number(NAME.exec(name)?.[1]) }));

test('every file in migrations/ is named NNN-words.js', () => {
  assert.deepEqual(numbered.filter((f) => !f.number).map((f) => f.name), []);
});

test('migration numbers are unique and run from 001 with no gaps', () => {
  const numbers = numbered.map((f) => f.number);
  assert.equal(new Set(numbers).size, numbers.length, 'two files share a number');
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => i + 1));
});

test('each entry of migrations.js is the file whose number matches its place', async () => {
  assert.equal(migrations.length, files.length, 'migrations.js and the folder list a different number of migrations');
  for (const { name, number } of numbered) {
    const { default: step } = await import(new URL(name, DIR));
    assert.equal(migrations[number - 1], step, `${name} should be entry ${number} of migrations.js`);
  }
});
