import fs from 'node:fs';
import quietSqliteWarning from '../lib/quietSqliteWarning.js';

// `node --test cloud/test/` loads this directory as a module, so this file is the entry point:
// it brings in every *.test.js next to it. Helpers live in helpers/ and are never run as tests.
quietSqliteWarning();
const dir = new URL('./', import.meta.url);
for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.test.js')).sort()) await import(new URL(file, dir));
