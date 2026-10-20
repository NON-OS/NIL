import db from '../db/connection.js';
import sql from '../db/sql.js';
import config from '../config.js';
import units from '../config/units.js';

let measured = null;

// What the workspace keeps on disk, in bytes: the database (pages in use, not the free ones
// SQLite will reuse) and attached files, trash included. Measured at most every
// STORAGE_CHECK_SECONDS, so a burst of writes doesn't sum the attachments table each time;
// `fresh` measures now, for the moment a write is about to be refused.
export default function storedBytes({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && measured && now - measured.at < config.uploads.storageCheckSeconds * units.SECOND) return measured.bytes;
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  const pages = db.prepare('PRAGMA page_count').get().page_count - db.prepare('PRAGMA freelist_count').get().freelist_count;
  const files = sql.get('SELECT COALESCE(SUM(size), 0) AS n FROM attachments').n;
  measured = { at: now, bytes: { database: pages * pageSize, files, total: pages * pageSize + files } };
  return measured.bytes;
}
