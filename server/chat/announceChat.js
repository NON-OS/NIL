import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import channelMembers from './channelMembers.js';

// Tells every member's open tabs about a change in a channel, once it's saved. `also` reaches
// people who just left or were taken out, so their tabs drop the channel. The event is encoded
// once, for those of them who are online.
export default function announceChat(channel, event, { also = [] } = {}) {
  const everyone = [...channelMembers(channel), ...also];
  sql.afterCommit(() => hub.toUsers(everyone, { type: 'chat', channelId: channel.id, ...event }));
}
