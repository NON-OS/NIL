import { register } from 'node:module';

// Loaded with `node --import` before the tests, so they can import the web app's modules.
register('./resolveTs.mjs', import.meta.url);
