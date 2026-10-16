import sql from '../db/sql.js';
import feedToken from './feedToken.js';

// Last-used times only need to be roughly right; calendar apps poll often.
const TOUCH_EVERY = 10 * 60_000;

const toFeed = (row) => (row ? { token: feedToken.make(row.id), createdAt: row.created_at, usedAt: row.used_at } : null);

// One calendar feed per person at most. Making a new one replaces the old link, which stops
// working at once; turning it off deletes it.
const feeds = {
  of: (userId) => toFeed(sql.get('SELECT * FROM calendar_feeds WHERE user_id = ?', userId)),

  rotate(userId) {
    sql.run(
      'INSERT INTO calendar_feeds (user_id, id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET id = excluded.id, created_at = excluded.created_at, used_at = NULL',
      userId,
      feedToken.newId(),
      Date.now(),
    );
    return feeds.of(userId);
  },

  revoke: (userId) => sql.run('DELETE FROM calendar_feeds WHERE user_id = ?', userId),

  // The active person a feed link belongs to, or null for a link that was replaced or turned off.
  open(token) {
    const id = feedToken.read(token);
    const row = id && sql.get('SELECT f.user_id, f.used_at FROM calendar_feeds f JOIN users u ON u.id = f.user_id WHERE f.id = ? AND u.deactivated = 0', id);
    if (!row) return null;
    const now = Date.now();
    if ((row.used_at ?? 0) < now - TOUCH_EVERY) sql.run('UPDATE calendar_feeds SET used_at = ? WHERE id = ?', now, id);
    return { userId: row.user_id };
  },
};

export default feeds;
