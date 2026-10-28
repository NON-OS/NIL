import sql from '../db/sql.js';

// Every sealed copy of one epoch's key for one person: the one sealed when the epoch started, and
// any a member handed over later. Browsers try each against the hash the epoch's member list
// names, so a bad copy from one member can't keep a good one from another out.
export default function wrapsFor(channelId, epoch, userId) {
  if (!epoch) return [];
  const first = sql.all('SELECT wrapped_key FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ? AND user_id = ?', channelId, epoch, userId);
  const later = sql.all('SELECT wrapped_key FROM chat_history_keys WHERE channel_id = ? AND epoch = ? AND user_id = ? ORDER BY created_at', channelId, epoch, userId);
  return [...first, ...later].map((r) => r.wrapped_key);
}
