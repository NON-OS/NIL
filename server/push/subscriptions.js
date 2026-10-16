import sql from '../db/sql.js';
import newId from '../lib/newId.js';

// Enough for every browser and phone a person uses; the oldest goes when a new one passes it.
const MAX_DEVICES = 20;

const toDevice = (row) => (row ? { showNames: Boolean(row.show_names), timeZone: row.time_zone } : null);

const subscriptions = {
  toDevice,

  of: (userId) => sql.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId),

  count: (userId) => sql.get('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', userId).n,

  find: (userId, endpoint) => sql.get('SELECT * FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', userId, endpoint),

  // A browser has one endpoint at a time. If someone else signs in on the same browser and
  // turns push on, the endpoint becomes theirs and starts over with the default settings.
  save(userId, sessionHash, { endpoint, p256dh, auth, timeZone, showNames }) {
    const now = Date.now();
    return sql.tx(() => {
      const existing = sql.get('SELECT * FROM push_subscriptions WHERE endpoint = ?', endpoint);
      if (existing?.user_id === userId) {
        sql.run(
          'UPDATE push_subscriptions SET session_hash = ?, p256dh = ?, auth = ?, time_zone = COALESCE(?, time_zone), show_names = COALESCE(?, show_names), updated_at = ? WHERE id = ?',
          sessionHash, p256dh, auth, timeZone ?? null, showNames === undefined ? null : Number(showNames), now, existing.id,
        );
        return sql.get('SELECT * FROM push_subscriptions WHERE id = ?', existing.id);
      }
      if (existing) sql.run('DELETE FROM push_subscriptions WHERE id = ?', existing.id);
      const extra = subscriptions.count(userId) - MAX_DEVICES + 1;
      if (extra > 0) sql.run('DELETE FROM push_subscriptions WHERE id IN (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at LIMIT ?)', userId, extra);
      const id = newId();
      sql.run(
        'INSERT INTO push_subscriptions (id, user_id, session_hash, endpoint, p256dh, auth, show_names, time_zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, userId, sessionHash, endpoint, p256dh, auth, showNames === false ? 0 : 1, timeZone ?? null, now, now,
      );
      return sql.get('SELECT * FROM push_subscriptions WHERE id = ?', id);
    });
  },

  update(userId, endpoint, { showNames, timeZone }) {
    sql.run(
      'UPDATE push_subscriptions SET show_names = COALESCE(?, show_names), time_zone = COALESCE(?, time_zone), updated_at = ? WHERE user_id = ? AND endpoint = ?',
      showNames === undefined ? null : Number(showNames), timeZone ?? null, Date.now(), userId, endpoint,
    );
    return subscriptions.find(userId, endpoint);
  },

  remove: (userId, endpoint) => sql.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', userId, endpoint),

  removeAll: (userId) => sql.run('DELETE FROM push_subscriptions WHERE user_id = ?', userId),

  drop: (id) => sql.run('DELETE FROM push_subscriptions WHERE id = ?', id),

  touch: (id) => sql.run('UPDATE push_subscriptions SET used_at = ? WHERE id = ?', Date.now(), id),

  // The zone of the device the person used most recently, for notes timed to their morning.
  zoneOf: (userId) => sql.get('SELECT time_zone FROM push_subscriptions WHERE user_id = ? AND time_zone IS NOT NULL ORDER BY updated_at DESC LIMIT 1', userId)?.time_zone ?? null,
};

export default subscriptions;
