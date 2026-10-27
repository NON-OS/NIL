import sql from '../db/sql.js';
import hub from '../realtime/hub.js';
import guestScope from '../services/guestScope.js';
import callInstance from './callInstance.js';
import callSockets from './callSockets.js';

// Gets call messages to the right tabs, whichever server process holds their connection. A
// message for a tab here goes straight to it. While other processes share the database, it's
// also written there for a few seconds for them to pick up; a lone process writes nothing.
const KEEP_MS = 10_000;
let last = null;

function sendTo(ws, data) {
  if (ws && ws.readyState === ws.OPEN) ws.send(data);
}

function deliver({ scope, user_id: userId, call_id: callId, session, body }) {
  if (scope === 'team') {
    const event = JSON.parse(body);
    return hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : event));
  }
  if (scope === 'user') return hub.toUser(userId, JSON.parse(body));
  const target = callSockets.get(callId, userId);
  if (target && target.session === session) sendTo(target.ws, body);
}

function share(row) {
  if (callInstance.alone()) return;
  sql.run('INSERT INTO call_events (origin, scope, user_id, call_id, session, body, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', callInstance.id, row.scope, row.user_id ?? null, row.call_id ?? null, row.session ?? null, row.body, Date.now() + KEEP_MS);
}

const callBus = {
  send: sendTo,

  user(userId, event) {
    const row = { scope: 'user', user_id: userId, body: JSON.stringify(event) };
    deliver(row);
    share(row);
  },

  // everyone on the team, never guests
  team(event) {
    const row = { scope: 'team', body: JSON.stringify(event) };
    deliver(row);
    share(row);
  },

  // one person's tab in one call, wherever it's connected
  member(callId, userId, session, event, { instance } = {}) {
    const row = { scope: 'member', user_id: userId, call_id: callId, session, body: JSON.stringify(event) };
    if (!instance || instance === callInstance.id) deliver(row);
    if (instance !== callInstance.id) share(row);
  },

  // what was there before this process started isn't for it
  start() {
    last = sql.get('SELECT COALESCE(MAX(id), 0) AS id FROM call_events').id;
  },

  // what the other processes wrote since the last look
  poll() {
    if (last === null) callBus.start();
    const rows = sql.all('SELECT * FROM call_events WHERE id > ? AND origin != ? AND expires_at > ? ORDER BY id', last, callInstance.id, Date.now());
    for (const row of rows) {
      last = Math.max(last, row.id);
      deliver(row);
    }
    sql.run('DELETE FROM call_events WHERE expires_at < ?', Date.now());
  },
};

export default callBus;
