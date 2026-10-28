import sql from '../db/sql.js';
import dropChatFiles from './dropChatFiles.js';

const DAY = 86_400_000;

// Forward-secret conversations: once an epoch ended more than the conversation's days ago, every
// sealed copy of its key goes, and the messages sealed under it with them, since nobody could
// open them again. Someone who later steals a member's keys finds nothing older to open. The
// key the conversation's name is sealed under stays until it's renamed.
export default function purgeOldKeys(now = Date.now()) {
  let purged = 0;
  for (const c of sql.all('SELECT id, epoch, meta_epoch, forward_days, purged_epoch FROM chat_channels WHERE forward_days IS NOT NULL')) {
    const ended = sql.get('SELECT MAX(epoch) - 1 AS e FROM chat_epochs WHERE channel_id = ? AND epoch > ? AND epoch <= ? AND created_at <= ?', c.id, c.purged_epoch + 1, c.epoch, now - c.forward_days * DAY).e;
    if (!ended || ended <= c.purged_epoch) continue;
    sql.tx(() => {
      sql.run('DELETE FROM chat_epoch_keys WHERE channel_id = ? AND epoch <= ? AND epoch IS NOT ?', c.id, ended, c.meta_epoch);
      sql.run('DELETE FROM chat_history_keys WHERE channel_id = ? AND epoch <= ? AND epoch IS NOT ?', c.id, ended, c.meta_epoch);
      dropChatFiles('message_id IN (SELECT id FROM chat_messages WHERE channel_id = ? AND epoch <= ?)', c.id, ended);
      sql.run('DELETE FROM chat_messages WHERE channel_id = ? AND epoch <= ? AND thread_id IS NOT NULL', c.id, ended);
      sql.run('DELETE FROM chat_messages WHERE channel_id = ? AND epoch <= ?', c.id, ended);
      sql.run('DELETE FROM chat_marks WHERE channel_id = ? AND epoch <= ?', c.id, ended);
      sql.run('UPDATE chat_channels SET purged_epoch = ? WHERE id = ?', ended, c.id);
    });
    purged += ended - c.purged_epoch;
  }
  return purged;
}
