import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import channelMembers from './channelMembers.js';

// Tells every member's open tabs about a change in a channel, once it's saved. `also` reaches
// people who just left or were taken out, so their tabs drop the channel.
export default function announceChat(channel, event, { also = [] } = {}) {
  const everyone = new Set([...channelMembers(channel), ...also]);
  sql.afterCommit(() => {
    for (const userId of everyone) hub.toUser(userId, { type: 'chat', channelId: channel.id, ...event });
  });
}
