// The connections this process holds into calls: one per person per call, from the tab they
// joined from, with that tab's budget for handshake messages.
const byKey = new Map();
const key = (callId, userId) => `${callId}\n${userId}`;

const callSockets = {
  bind(callId, userId, ws, session) {
    const previous = byKey.get(key(callId, userId));
    byKey.set(key(callId, userId), { callId, userId, ws, session, budget: { start: Date.now(), count: 0 } });
    return previous && previous.ws !== ws ? previous : null;
  },

  get: (callId, userId) => byKey.get(key(callId, userId)) ?? null,

  drop(callId, userId) {
    byKey.delete(key(callId, userId));
  },

  // the calls one closed socket was in, now let go of
  release(ws) {
    const out = [...byKey.values()].filter((s) => s.ws === ws);
    for (const s of out) byKey.delete(key(s.callId, s.userId));
    return out;
  },

  clear: () => byKey.clear(),
};

export default callSockets;
