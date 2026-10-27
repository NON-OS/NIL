import sql from '../db/sql.js';
import announceChat from './announceChat.js';
import eraseChannel from './eraseChannel.js';

// Conversations nobody can use any more, once someone is erased or starts over with new keys:
// a private one with nobody left in it, and any whose current key nobody holds, since nobody could
// then read it or start a new key. Those go, with everything in them. A direct message with one
// person left lets go of the pair, so no erased account's id stays in it. Returns how many went.
export default function eraseOrphans() {
  const dead = sql.all(
    `SELECT c.* FROM chat_channels c
     WHERE (c.audience = 'people' AND NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id))
        OR NOT EXISTS (SELECT 1 FROM chat_epoch_keys k WHERE k.channel_id = c.id AND k.epoch = c.epoch)
     LIMIT 500`,
  );
  for (const channel of dead) {
    announceChat(channel, { kind: 'gone' });
    eraseChannel(channel);
  }
  sql.run("UPDATE chat_channels SET pair = NULL WHERE kind = 'dm' AND pair IS NOT NULL AND (SELECT COUNT(*) FROM chat_members m WHERE m.channel_id = chat_channels.id) < 2");
  return dead.length;
}
