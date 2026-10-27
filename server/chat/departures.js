import sql from '../db/sql.js';
import channelMembers from './channelMembers.js';

// The people who hold a conversation's current key but aren't in it any more, each with the newest
// signed statement that says so: their own, for leaving it, or an admin's, for leaving the team.
// A statement is what lets any member's browser start the next key without them. Null means
// nobody signed one yet, and only whoever manages the conversation can leave them out.
export default function departures(channel) {
  const members = new Set(channelMembers(channel));
  const holders = sql.all('SELECT user_id FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ?', channel.id, channel.epoch).map((r) => r.user_id);
  return holders
    .filter((id) => !members.has(id))
    .map((userId) => {
      const row = sql.get('SELECT statement FROM chat_departures WHERE user_id = ? AND (channel_id = ? OR channel_id IS NULL) ORDER BY id DESC LIMIT 1', userId, channel.id);
      return { userId, statement: row?.statement ?? null };
    });
}
