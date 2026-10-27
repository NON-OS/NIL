import sql from '../db/sql.js';
import chatPeople from './chatPeople.js';

// Everyone in a channel as the server counts them: the whole team for a team channel, otherwise
// the people added to it who are still active. Holding the current key is a separate matter.
export default function channelMembers(channel) {
  if (channel.audience === 'team') return chatPeople.all();
  return sql
    .all("SELECT m.user_id FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? AND u.deactivated = 0 AND u.kind = 'human' AND u.role != 'guest' ORDER BY m.user_id", channel.id)
    .map((r) => r.user_id);
}
