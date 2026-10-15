import sql from '../db/sql.js';

const settingsStore = {
  get(key, fallback) {
    const row = sql.get('SELECT value FROM settings WHERE key = ?', key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    sql.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  },
};

export default settingsStore;
