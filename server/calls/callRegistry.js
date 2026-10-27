import newId from '../lib/newId.js';

// Every live call, in memory only. Who is in which call, and since when, is the one thing the
// server learns about a call; it is never written to the database or the log, and it is gone
// the moment the call ends. A restart forgets every call (see callMembership's resume).
const calls = new Map();

// What the app is told about a call: its people and nothing about what they say or show.
function view(call) {
  return {
    id: call.id,
    kind: call.kind,
    projectId: call.projectId,
    startedBy: call.startedBy,
    startedAt: call.startedAt,
    members: [...call.members].map(([userId, m]) => ({ userId, session: m.session, joinedAt: m.joinedAt })),
    ringing: [...call.ringing.keys()],
  };
}

const callRegistry = {
  view,

  create({ by, kind, projectId = null }) {
    const call = {
      id: newId(),
      kind,
      projectId,
      startedBy: by,
      startedAt: Date.now(),
      // a call with a person is for the people asked in; a project call is open to the team
      allowed: new Set([by]),
      members: new Map(),
      ringing: new Map(),
      // until when people may take back a call the server forgot (see restore)
      resumeUntil: 0,
      timer: null,
    };
    calls.set(call.id, call);
    return call;
  },

  // A call the server forgot in a restart, taken back under its own id by the people still in
  // it. The id is a random secret only they hold, and only for a short while after the restart.
  restore(id, by, until, projectId = null) {
    const call = callRegistry.create({ by, kind: projectId ? 'project' : 'person', projectId });
    call.resumeUntil = until;
    calls.delete(call.id);
    call.id = id;
    calls.set(id, call);
    return call;
  },

  get: (id) => (typeof id === 'string' ? calls.get(id) ?? null : null),

  all: () => [...calls.values()],

  // Only someone in a call, asked into it, or able to join it as a member of the team hears of it.
  visibleTo(call, userId) {
    return call.kind === 'project' || call.allowed.has(userId) || call.members.has(userId) || call.ringing.has(userId);
  },

  mayJoin(call, userId) {
    return call.kind === 'project' || call.allowed.has(userId) || call.resumeUntil > Date.now();
  },

  remove(call) {
    clearTimeout(call.timer);
    for (const m of call.members.values()) clearTimeout(m.dropTimer);
    for (const r of call.ringing.values()) clearTimeout(r.timer);
    call.members.clear();
    call.ringing.clear();
    call.allowed.clear();
    calls.delete(call.id);
  },

  // the calls one socket is in, for when it closes
  withSocket: (ws) => [...calls.values()].filter((call) => [...call.members.values()].some((m) => m.ws === ws)),

  clear() {
    for (const call of [...calls.values()]) callRegistry.remove(call);
  },
};

export default callRegistry;
