import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import styleReach from './helpers/styleReach.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

// Screens load their stylesheets the first time they open. A component that borrows a class
// from another screen's stylesheet looks unstyled when someone opens its screen straight from
// a link, so every class a module uses must come from CSS that is sure to be loaded with it.
test('every class a component uses is styled by CSS that loads with it', () => {
  assert.deepEqual(styleReach(SRC, path.join(SRC, 'main.tsx')), []);
});
