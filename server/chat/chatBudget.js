import sql from '../db/sql.js';
import config from '../config.js';
import units from '../config/units.js';
import HttpError from '../lib/HttpError.js';

// what's counted for each person, worked out again from the messages now and then, since the
// sweep and deletions take bytes away without telling it
const counted = new Map();
const RECOUNT_MS = 10 * units.MINUTE;

function used(userId) {
  const held = counted.get(userId);
  if (held && Date.now() - held.at < RECOUNT_MS) return held;
  const sum = (q) => sql.get(q, userId).n;
  const bytes =
    sum('SELECT COALESCE(SUM(LENGTH(body_ct)), 0) AS n FROM chat_messages WHERE sender_id = ?') +
    sum('SELECT COALESCE(SUM(LENGTH(roster) + COALESCE(LENGTH(proofs), 0)), 0) AS n FROM chat_epochs WHERE created_by = ?') +
    sum('SELECT COALESCE(SUM(LENGTH(wrapped_key)), 0) AS n FROM chat_history_keys WHERE granted_by = ?') +
    sum('SELECT COALESCE(SUM(LENGTH(wrapped_key)), 0) AS n FROM chat_epoch_keys WHERE granted_by = ?') +
    sum('SELECT COALESCE(SUM(LENGTH(body_ct)), 0) AS n FROM chat_marks WHERE user_id = ?');
  const fresh = { bytes, at: Date.now() };
  counted.set(userId, fresh);
  return fresh;
}

// How much encrypted chat one person may keep on the server (CHAT_MEMBER_MB): messages, edits and
// reactions, the member lists they signed and the keys they sealed, and their marks, together, so nobody can fill its disk with them. Throws when `bytes` more won't fit;
// otherwise counts them.
export default function chatBudget(userId, bytes) {
  const max = config.chat.memberBytes;
  const held = used(userId);
  if (bytes > 0 && held.bytes + bytes > max) throw new HttpError(413, `You’ve used the ${Math.round(max / units.MB)} MB of chat space you have on this server. Delete messages you no longer need, or ask whoever runs the server for more.`);
  held.bytes += bytes;
}
