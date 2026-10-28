import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import rosterLead from './rosterLead.js';

// Who manages a conversation by its current signed member list, the say every browser holds
// changes to: the managers it names, or everyone in it when it names none.
export default function signedLead(channel) {
  const facts = parseJSON(sql.get('SELECT roster FROM chat_epochs WHERE channel_id = ? AND epoch = ?', channel.id, channel.epoch)?.roster, null)?.facts;
  return facts ? rosterLead({ members: facts[2], managers: facts[3] }) : [];
}
