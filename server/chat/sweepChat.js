import sql from '../db/sql.js';
import config from '../config.js';
import dropChatFiles from './dropChatFiles.js';
import purgeOldKeys from './purgeOldKeys.js';
import eraseOrphans from './eraseOrphans.js';
import checkpoint from '../db/checkpoint.js';

// Runs every JOB_CHAT_SWEEP_SECONDS. Disappearing messages go once their time is up, with their
// files and, for a thread's first message, the replies under it; browsers already hide them by
// then. Files that were sent but never posted in a message go after CHAT_UNPOSTED_FILE_MINUTES,
// marks of tabs quiet for CHAT_MARK_DAYS go, forward-secret conversations let go of old keys,
// and conversations nobody can use any more go (see eraseOrphans).
export default function sweepChat() {
  const now = Date.now();
  const expired = sql.all('SELECT id, channel_id, thread_id FROM chat_messages WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 2000', now);
  sql.tx(() => {
    for (const m of expired) {
      dropChatFiles('message_id IN (SELECT id FROM chat_messages WHERE id = ? OR thread_id = ?)', m.id, m.id);
      sql.run('DELETE FROM chat_messages WHERE thread_id = ? AND channel_id = ?', m.id, m.channel_id);
      sql.run('DELETE FROM chat_messages WHERE id = ?', m.id);
      if (m.thread_id) sql.run("UPDATE chat_messages SET replies = (SELECT COUNT(*) FROM chat_messages WHERE channel_id = ? AND thread_id = ? AND kind = 'message' AND deleted = 0) WHERE id = ?", m.channel_id, m.thread_id, m.thread_id);
    }
    dropChatFiles('message_id IS NULL AND created_at < ?', now - config.chat.unpostedFileMs);
    sql.run('DELETE FROM chat_marks WHERE updated_at < ?', now - config.chat.markDays * 86_400_000);
  });
  const purged = purgeOldKeys(now);
  const orphans = eraseOrphans();
  // what was just erased shouldn't linger in the write-ahead log
  if (expired.length || purged || orphans) checkpoint();
  return expired.length;
}
