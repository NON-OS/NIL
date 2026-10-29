import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import chatPeople from './chatPeople.js';

// A channel answers only its members. To everyone else it doesn't exist, the way a doc without a
// key for you doesn't.
export default function channelAccess(channelId, user) {
  const channel = typeof channelId === 'string' ? sql.get('SELECT * FROM chat_channels WHERE id = ?', channelId) : null;
  const member = channel && chatPeople.includes(user.id) && (channel.audience === 'team' || sql.get('SELECT 1 FROM chat_members WHERE channel_id = ? AND user_id = ?', channel.id, user.id));
  if (!member) throw HttpError.notFound('That conversation');
  return channel;
}
