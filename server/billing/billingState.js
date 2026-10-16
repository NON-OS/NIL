import sql from '../db/sql.js';

// Key-value state that belongs to the server's billing, not to the workspace: paid-until, the
// trial's start, the chain scan cursor. Kept out of `settings` so an erase or a capsule restore
// can't reset it.
const billingState = {
  get(key, fallback) {
    const row = sql.get('SELECT value FROM billing_state WHERE key = ?', key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    sql.run('INSERT INTO billing_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  },
};

export default billingState;
