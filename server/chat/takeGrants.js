import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import chatPeople from './chatPeople.js';

// A sealed epoch key: an ephemeral public key, an IV and the encrypted key with its tag, the
// same 123 characters as a sealed doc key.
const WRAPPED = 123;

// Stores an epoch's key as a browser sealed it for each person. For a new epoch the grants have
// to go to people its member list names, the signer among them; the others it names wait for a
// copy from a member who confirmed their key. A copy handed over later goes to someone in the
// channel now and is kept apart under its giver; for the current epoch, to someone who has no
// copy yet, it's what makes them hold the key.
export default function takeGrants(channelId, epoch, grants, grantedBy, { within = null, members = null, history = false, current = null } = {}) {
  if (!Array.isArray(grants) || grants.length > 5000) throw HttpError.badRequest('Too many keys at once.');
  const clean = grants.map((g) => ({ userId: String(g?.userId ?? ''), wrappedKey: cipherText(g?.wrappedKey, 'Wrapped key', { exact: WRAPPED }) }));
  const ids = clean.map((g) => g.userId);
  if (new Set(ids).size !== ids.length) throw HttpError.badRequest('One key per person.');
  if (within && (!ids.includes(grantedBy) || !ids.every((id) => within.includes(id)))) throw HttpError.badRequest('Seal the key for yourself and only for people the member list names.');
  if (members && !ids.every((id) => members.includes(id))) throw HttpError.badRequest('Only people in this conversation can get its keys.');
  if (chatPeople.withKeys(ids).size !== ids.length) throw HttpError.badRequest('One of those people can’t receive encrypted messages yet.');
  const now = Date.now();
  for (const g of clean) {
    // a later copy is filed under its giver, who may replace their own
    const holds = sql.get('SELECT 1 FROM chat_epoch_keys WHERE channel_id = ? AND epoch = ? AND user_id = ?', channelId, epoch, g.userId);
    if (history && !(epoch === current && !holds)) {
      sql.run(
        'INSERT INTO chat_history_keys (channel_id, epoch, user_id, granted_by, wrapped_key, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (channel_id, epoch, user_id, granted_by) DO UPDATE SET wrapped_key = excluded.wrapped_key, created_at = excluded.created_at',
        channelId, epoch, g.userId, grantedBy, g.wrappedKey, now,
      );
      continue;
    }
    sql.run('INSERT INTO chat_epoch_keys (channel_id, epoch, user_id, wrapped_key, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', channelId, epoch, g.userId, g.wrappedKey, grantedBy, now);
  }
  return ids;
}
