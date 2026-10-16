import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

const db = new DatabaseSync(config.dbFile || path.join(config.dataDir, 'nonos.db'));

// secure_delete zeroes freed pages so deleted comments and tasks don't linger in the file.
// journal_size_limit stops the write-ahead log keeping the size of its largest burst forever;
// analysis_limit keeps the periodic PRAGMA optimize quick on large tables, as SQLite advises.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA secure_delete = ON;
  PRAGMA journal_size_limit = ${config.dbJournalLimitBytes};
  PRAGMA analysis_limit = 400;
`);

export default db;
