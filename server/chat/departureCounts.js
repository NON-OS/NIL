import sql from '../db/sql.js';
import parseJSON from '../lib/parseJSON.js';
import rosterLead from './rosterLead.js';

// When someone joined for the last time: the time of the earliest list in the unbroken run of
// stored lists, up to the current one, that names them.
function joinedAt(channelId, epoch, userId) {
  let at = 0;
  for (let e = epoch; e >= 1; e--) {
    const facts = parseJSON(sql.get('SELECT roster FROM chat_epochs WHERE channel_id = ? AND epoch = ?', channelId, e)?.roster, null)?.facts;
    if (!facts || !facts[2].includes(userId)) break;
    at = facts[6];
  }
  return at;
}

const isAdmin = (userId) => Boolean(sql.get("SELECT 1 FROM users WHERE id = ? AND deactivated = 0 AND role IN ('owner', 'admin')", userId));

// Whether a stored departure statement (its signature was checked when it was filed) counts for
// leaving `userId` out of the list after `prev`, the way browsers decide it (departureCounts in
// the web app): their own leaving, or a removal from the team signed by someone who manages the
// conversation or by an admin, signed since they last joined. Browsers also need the admin's key
// confirmed; one that hasn't yet catches up once it does.
export default function departureCounts(statement, channel, userId, prev) {
  const value = parseJSON(statement, null);
  const at = value?.facts?.[0];
  if (!value || !Number.isSafeInteger(at)) return false;
  const leave = value.text === '' && value.by === userId;
  const removal = value.text === userId && (rosterLead(prev).includes(value.by) || isAdmin(value.by));
  return (leave || removal) && at >= joinedAt(channel.id, channel.epoch, userId);
}
