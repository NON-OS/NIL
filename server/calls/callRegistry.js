import sql from '../db/sql.js';
import config from '../config.js';
import newId from '../lib/newId.js';
import sfuToken from './sfuToken.js';

// Every live call, in the database so it outlives a restart and is shared by every server
// process: who started it, who is in it or being rung, and nothing else. A call is deleted the
// moment it ends, with everyone in it, and one nobody refreshes expires by itself.
const HOUR = 3_600_000;
const expiry = (now = Date.now()) => now + config.calls.recordHours * HOUR;

function load(id) {
  const row = typeof id === 'string' ? sql.get('SELECT * FROM calls WHERE id = ?', id) : null;
  if (!row) return null;
  const people = new Map(sql.all('SELECT * FROM call_people WHERE call_id = ? ORDER BY joined_at, user_id', id).map((p) => [p.user_id, p]));
  return { id: row.id, kind: row.kind, projectId: row.project_id, startedBy: row.started_by, startedAt: row.started_at, mode: row.mode, people };
}

const COLUMNS = new Set(['state', 'ring_until', 'session', 'joined_at', 'instance', 'connected', 'seen_at']);
const inState = (call, state) => [...call.people.values()].filter((p) => p.state === state);

const callRegistry = {
  // What the app is told about a call: its people and nothing about what they say or show.
  view: (call) => ({
    id: call.id,
    kind: call.kind,
    projectId: call.projectId,
    startedBy: call.startedBy,
    startedAt: call.startedAt,
    mode: call.mode,
    members: inState(call, 'member').map((p) => ({ userId: p.user_id, session: p.session, joinedAt: p.joined_at, ...(call.mode === 'sfu' && config.calls.sfu ? { sfu: sfuToken.identity(call.id, p.user_id, p.session) } : {}) })),
    ringing: inState(call, 'ringing').map((p) => p.user_id),
  }),

  create({ by, kind, projectId = null }) {
    const id = newId();
    const now = Date.now();
    sql.tx(() => {
      sql.run('INSERT INTO calls (id, kind, project_id, started_by, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', id, kind, projectId, by, now, expiry(now));
      sql.run("INSERT INTO call_people (call_id, user_id, state) VALUES (?, ?, 'allowed')", id, by);
    });
    return load(id);
  },

  get: load,

  all: () => sql.all('SELECT id FROM calls').map((r) => load(r.id)).filter(Boolean),

  members: (call) => inState(call, 'member'),
  ringing: (call) => inState(call, 'ringing'),
  member: (call, userId) => (call.people.get(userId)?.state === 'member' ? call.people.get(userId) : null),

  // Only someone in a call, asked into it, or able to join it as a member of the team hears of it.
  visibleTo: (call, userId) => call.kind === 'project' || call.people.has(userId),
  mayJoin: (call, userId) => call.kind === 'project' || call.people.has(userId),

  // sets one person's place in a call; fields are column names
  put(callId, userId, fields) {
    const names = Object.keys(fields);
    if (!names.length || !names.every((n) => COLUMNS.has(n))) throw new Error(`callRegistry.put: unknown field in ${names.join(', ')}`);
    const values = names.map((n) => fields[n]);
    if (sql.run(`UPDATE call_people SET ${names.map((n) => `${n} = ?`).join(', ')} WHERE call_id = ? AND user_id = ?`, ...values, callId, userId).changes) return;
    sql.run(`INSERT INTO call_people (call_id, user_id, ${names.join(', ')}) VALUES (?, ?, ${names.map(() => '?').join(', ')})`, callId, userId, ...values);
  },

  setMode: (callId, mode) => sql.run('UPDATE calls SET mode = ? WHERE id = ?', mode, callId),

  // keeps a call that people are still in from expiring
  refresh: (callId, now = Date.now()) => sql.run('UPDATE calls SET expires_at = ? WHERE id = ?', expiry(now), callId),

  remove: (callId) => sql.run('DELETE FROM calls WHERE id = ?', callId).changes > 0,
};

export default callRegistry;
