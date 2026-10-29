import { test } from 'node:test';
import assert from 'node:assert/strict';
import codeParts from '../src/lib/codeParts.ts';

test('plain text stays one piece', () => {
  assert.deepEqual(codeParts('hello there'), [{ kind: 'text', text: 'hello there' }]);
});

test('backticks mark code inside a line', () => {
  assert.deepEqual(codeParts('run `npm test` now'), [
    { kind: 'text', text: 'run ' },
    { kind: 'code', text: 'npm test' },
    { kind: 'text', text: ' now' },
  ]);
});

test('a fenced block keeps its lines, and the language tag is dropped', () => {
  assert.deepEqual(codeParts('look:\n```js\nconst a = 1;\nconst b = 2;\n```\nok'), [
    { kind: 'text', text: 'look:' },
    { kind: 'block', text: 'const a = 1;\nconst b = 2;' },
    { kind: 'text', text: 'ok' },
  ]);
});

test('an unclosed fence or backtick is just text', () => {
  assert.deepEqual(codeParts('```\nnot closed'), [{ kind: 'text', text: '```\nnot closed' }]);
  assert.deepEqual(codeParts('a ` b'), [{ kind: 'text', text: 'a ` b' }]);
});

test('an empty block is left as typed', () => {
  assert.deepEqual(codeParts('``````'), [{ kind: 'text', text: '``````' }]);
});
