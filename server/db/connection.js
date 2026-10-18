import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });

const db = new DatabaseSync(config.dbFile || path.join(config.dataDir, 'nonos.db'));

// synchronous = FULL syncs the write-ahead log at every commit. With NORMAL a power cut could
// take back the last commits: a receipt someone already downloaded would be signed again under
// the same number, and a payment already counted could be counted twice. It costs well under a
// millisecond per commit on an SSD. temp_store = MEMORY keeps sorts and temporary tables out of
// temporary files, so none of that reaches the disk in the clear.
// secure_delete zeroes freed pages so deleted comments and tasks don't linger in the file.
// journal_size_limit stops the write-ahead log keeping the size of its largest burst forever;
// analysis_limit keeps the periodic PRAGMA optimize quick on large tables, as SQLite advises.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;
  PRAGMA temp_store = MEMORY;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = ${config.dbBusyTimeoutMs};
  PRAGMA secure_delete = ON;
  PRAGMA journal_size_limit = ${config.dbJournalLimitBytes};
  PRAGMA analysis_limit = 400;
`);

export default db;
