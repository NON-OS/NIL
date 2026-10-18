import sql from '../db/sql.js';
import inviteIsLive from './inviteIsLive.js';

// An invite link can be used while it's live and the person who made it still could make it:
// they still have access, and for an admin invite, they're still an admin. Links are revoked
// when that changes; this catches any that weren't.
export default function inviteUsable(row, now = Date.now()) {
  if (!inviteIsLive(row, now)) return false;
  const creator = row.created_by ? sql.get('SELECT role, deactivated FROM users WHERE id = ?', row.created_by) : null;
  if (!creator || creator.deactivated) return false;
  return row.role !== 'admin' || creator.role === 'owner' || creator.role === 'admin';
}
