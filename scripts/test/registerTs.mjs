import { register } from 'node:module';

// Loaded with `node --import` before the tests, so they can import the web app's modules,
// components included.
register('./resolveTs.mjs', import.meta.url);
register('./loadTsx.mjs', import.meta.url);
