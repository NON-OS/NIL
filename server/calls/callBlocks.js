import sql from '../db/sql.js';
import config from '../config.js';

const EVERYONE = '*';
// rings from one person to another, by pair, within the window
const rings = new Map();

// Who may ring whom. Someone can block a teammate from ringing them, or not take calls at all
// for a while; either way the caller hears no answer, and nobody is told they were blocked. And
// one person can ring another only so often, so a call can't be used to pester anyone.
const callBlocks = {
  mayRing(from, to, now = Date.now()) {
    if (sql.get('SELECT 1 FROM call_blocks WHERE user_id = ? AND blocked_id IN (?, ?)', to, from, EVERYONE)) return false;
    const key = `${from}\n${to}`;
    const recent = (rings.get(key) ?? []).filter((t) => now - t < config.calls.ringWindowMinutes * 60_000);
    if (recent.length >= config.calls.ringsPerPerson) return false;
    rings.set(key, [...recent, now]);
    return true;
  },

  of: (userId) => {
    const rows = sql.all('SELECT blocked_id FROM call_blocks WHERE user_id = ?', userId).map((r) => r.blocked_id);
    return { dnd: rows.includes(EVERYONE), blocked: rows.filter((id) => id !== EVERYONE) };
  },

  set(userId, blockedId, on) {
    if (on) sql.run('INSERT INTO call_blocks (user_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', userId, blockedId);
    else sql.run('DELETE FROM call_blocks WHERE user_id = ? AND blocked_id = ?', userId, blockedId);
  },

  everyone: EVERYONE,

  forget: () => rings.clear(),
};

setInterval(() => {
  const now = Date.now();
  for (const [key, times] of rings) if (times.every((t) => now - t > config.calls.ringWindowMinutes * 60_000)) rings.delete(key);
}, 60_000).unref();

export default callBlocks;
