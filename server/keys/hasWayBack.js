import sql from '../db/sql.js';

// Whether a member could get their keys back without a passkey: a wallet wrap, leaving out the
// wallet at `without` (one about to be removed), or a recovery kit saved for their current keys.
export default function hasWayBack(userId, { without = null } = {}) {
  if (sql.get('SELECT 1 FROM encryption_keys WHERE user_id = ? AND kit_saved_at IS NOT NULL', userId)) return true;
  return Boolean(sql.get('SELECT 1 FROM identity_wraps WHERE user_id = ? AND address IS NOT ?', userId, without));
}
