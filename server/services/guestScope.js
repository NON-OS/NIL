import sql from '../db/sql.js';

const cache = new Map();

// For a guest, the set of project ids shared with them; for everyone else, null. Asked on
// every visibility check, so it's cached and dropped whenever a role or share changes.
const guestScope = {
  of(userId) {
    if (cache.has(userId)) return cache.get(userId);
    const user = sql.get('SELECT role FROM users WHERE id = ?', userId);
    const scope = user?.role === 'guest' ? new Set(sql.all('SELECT project_id FROM project_guests WHERE user_id = ?', userId).map((r) => r.project_id)) : null;
    cache.set(userId, scope);
    return scope;
  },

  forget(userId) {
    if (userId) cache.delete(userId);
    else cache.clear();
  },
};

export default guestScope;
