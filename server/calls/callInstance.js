import sql from '../db/sql.js';
import newId from '../lib/newId.js';

// This server process among the others sharing the database. Each one says it's alive every
// few seconds; a process that stops saying so is counted gone, and the people whose
// connections it held get the same time to come back as after any dropped connection.
const id = newId();
const ALIVE_MS = 15_000;
let others = 0;
let checked = 0;
// how stale the count of other processes may get before it's looked up again
const RECHECK_MS = 500;

const callInstance = {
  id,
  aliveMs: ALIVE_MS,

  beat(now = Date.now()) {
    sql.run('INSERT INTO call_instances (id, seen_at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET seen_at = excluded.seen_at', id, now);
    sql.run('DELETE FROM call_instances WHERE seen_at < ?', now - ALIVE_MS);
    callInstance.count(now);
  },

  count(now = Date.now()) {
    others = sql.get('SELECT COUNT(*) AS n FROM call_instances WHERE id != ? AND seen_at >= ?', id, now - ALIVE_MS).n;
    checked = now;
  },

  // whether anything has to go through the database to reach another process
  alone() {
    if (Date.now() - checked > RECHECK_MS) callInstance.count();
    return others === 0;
  },

  live: (now = Date.now()) => new Set(sql.all('SELECT id FROM call_instances WHERE seen_at >= ?', now - ALIVE_MS).map((r) => r.id)),

  stop() {
    sql.run('DELETE FROM call_instances WHERE id = ?', id);
  },
};

export default callInstance;
