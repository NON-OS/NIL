import config from '../config.js';
import sql from '../db/sql.js';
import log from '../lib/log.js';
import callRegistry from './callRegistry.js';
import callMembership from './callMembership.js';
import callAnnounce from './callAnnounce.js';
import callInstance from './callInstance.js';
import callBus from './callBus.js';
import callRing from './callRing.js';
import callable from './callable.js';

const POLL_MS = 250;
const SWEEP_MS = 1000;
const BEAT_MS = 5000;
let timers = [];
let lastBeat = 0;

// Rings that ran out become missed calls, people whose connection stayed away too long leave,
// calls nobody joined or refreshed end. Each process sweeps; every change is guarded in SQL, so
// two processes never both act on the same thing.
function sweep() {
  const now = Date.now();
  if (now - lastBeat >= BEAT_MS) {
    lastBeat = now;
    callInstance.beat(now);
    sql.run('UPDATE call_people SET seen_at = ? WHERE instance = ? AND connected = 1', now, callInstance.id);
    sql.run("UPDATE calls SET expires_at = ? WHERE id IN (SELECT call_id FROM call_people WHERE instance = ? AND connected = 1 AND state = 'member')", now + config.calls.recordHours * 3_600_000, callInstance.id);
  }
  for (const row of sql.all("SELECT call_id, user_id FROM call_people WHERE state = 'ringing' AND ring_until < ?", now)) {
    if (!sql.run("UPDATE call_people SET state = 'allowed', ring_until = NULL WHERE call_id = ? AND user_id = ? AND state = 'ringing'", row.call_id, row.user_id).changes) continue;
    const call = callRegistry.get(row.call_id);
    if (!call) continue;
    callAnnounce.ringEnd(call, row.user_id);
    callRing(row.user_id, call.id, { missed: true });
    if (!callRegistry.members(call).length && !callRegistry.ringing(call).length) callMembership.end(call);
    else callAnnounce.update(call);
  }
  // a connection this process doesn't hold, gone longer than people get to come back
  const live = [...callInstance.live(now)];
  const away = sql.all(
    `SELECT call_id, user_id FROM call_people WHERE state = 'member' AND seen_at < ?
     AND (connected = 0 OR instance IS NULL OR instance NOT IN (${live.map(() => '?').join(', ') || "''"}))`,
    now - config.calls.rejoinSeconds * 1000,
    ...live,
  );
  // someone made a guest, removed or locked out while in a call leaves it at the next sweep
  away.push(...sql.all(`SELECT p.call_id, p.user_id FROM call_people p JOIN users u ON u.id = p.user_id WHERE p.state = 'member' AND NOT (${callable.rule('u.')})`));
  for (const row of away) {
    const call = callRegistry.get(row.call_id);
    if (call) callMembership.leave(call, row.user_id);
  }
  const stale = sql.all(
    `SELECT id FROM calls c WHERE expires_at < ? OR (started_at < ?
     AND NOT EXISTS (SELECT 1 FROM call_people p WHERE p.call_id = c.id AND p.state IN ('member', 'ringing')))`,
    now,
    now - config.calls.ringSeconds * 1000,
  );
  for (const row of stale) {
    const call = callRegistry.get(row.id);
    if (call) callMembership.end(call);
  }
}

const guarded = (name, fn) => () => {
  try {
    fn();
  } catch (err) {
    log.error('calls', `The call ${name} failed.`, err);
  }
};

const callSweep = {
  sweep,

  // After a restart, everyone who was in a call gets the same time to come back as after a
  // dropped connection, counted from now, however long the server was away.
  start() {
    const now = Date.now();
    callInstance.beat(now);
    const live = [...callInstance.live(now)].filter((id) => id !== callInstance.id);
    sql.run(`UPDATE call_people SET connected = 0, seen_at = ? WHERE state = 'member' AND (instance IS NULL OR instance NOT IN (${live.map(() => '?').join(', ') || "''"}))`, now, ...live);
    lastBeat = now;
    callBus.start();
    timers = [setInterval(guarded('sweep', sweep), SWEEP_MS).unref(), setInterval(guarded('mailbox', callBus.poll), POLL_MS).unref()];
  },

  stop() {
    timers.forEach(clearInterval);
    timers = [];
    callInstance.stop();
  },
};

export default callSweep;
