import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import chatPeople from './chatPeople.js';

// A sealed epoch key: an ephemeral public key, an IV and the encrypted key with its tag, the
// same 123 characters as a sealed doc key.
const WRAPPED = 123;

// Stores an epoch's key as a browser sealed it for each person. For a new epoch the grants have
// to cover exactly the people its member list names; a newcomer handed older epochs (the
// channel's history) must be in the channel now, and that copy is kept apart under its giver.
export default function takeGrants(channelId, epoch, grants, grantedBy, { exactly = null, members = null, history = false } = {}) {
  if (!Array.isArray(grants) || grants.length > 5000) throw HttpError.badRequest('Too many keys at once.');
  const clean = grants.map((g) => ({ userId: String(g?.userId ?? ''), wrappedKey: cipherText(g?.wrappedKey, 'Wrapped key', { exact: WRAPPED }) }));
  const ids = clean.map((g) => g.userId);
  if (new Set(ids).size !== ids.length) throw HttpError.badRequest('One key per person.');
  if (exactly && (ids.length !== exactly.length || !exactly.every((id) => ids.includes(id)))) throw HttpError.badRequest('Seal the key for exactly the people the member list names.');
  if (members && !ids.every((id) => members.includes(id))) throw HttpError.badRequest('Only people in this conversation can get its keys.');
  if (chatPeople.withKeys(ids).size !== ids.length) throw HttpError.badRequest('One of those people can’t receive encrypted messages yet.');
  const now = Date.now();
  for (const g of clean) {
    // a later copy is filed under its giver, who may replace their own
    if (history) {
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
