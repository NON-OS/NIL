import sql from '../db/sql.js';
import currentUser from './currentUser.js';

const lastSeenWrites = new Map();

export default function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  req.user = user;
  req.viewer = { id: user.id, isAdmin: user.isAdmin };

  // last-seen only needs minute precision; don't write on every request
  const now = Date.now();
  if ((lastSeenWrites.get(user.id) ?? 0) < now - 60_000) {
    lastSeenWrites.set(user.id, now);
    sql.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now, user.id);
  }
  next();
}
