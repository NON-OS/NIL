import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';

const DAY = 86_400_000;

// Retention: trashed tasks after TRASH_DAYS, read notifications after 90 days,
// dead sessions and invites as soon as they expire.
export default function purge() {
  const now = Date.now();
  const cutoff = now - config.trashDays * DAY;

  const files = sql.all(
    'SELECT a.id FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE t.deleted_at IS NOT NULL AND t.deleted_at < ?',
    cutoff,
  );
  sql.tx(() => {
    sql.run('DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ?', cutoff);
    sql.run('DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < ?', now - 90 * DAY);
    sql.run('DELETE FROM sessions WHERE expires_at < ?', now);
    sql.run('DELETE FROM invites WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)', now, now - 30 * DAY);
  });
  for (const { id } of files) fs.rm(path.join(uploadDir, id), { force: true }, () => {});
}
