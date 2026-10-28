import sql from '../db/sql.js';
import dropChatFiles from './dropChatFiles.js';

// Deletes a conversation with every message, key and file in it.
export default function eraseChannel(channel) {
  sql.tx(() => {
    dropChatFiles('channel_id = ?', channel.id);
    sql.run('DELETE FROM chat_channels WHERE id = ?', channel.id);
  });
}
