import hub from '../realtime/hub.js';
import guestScope from '../services/guestScope.js';
import callRegistry from './callRegistry.js';

function send(ws, event) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

// Who hears about changes to a call: everyone in it or asked into it, and for a project call
// the whole team (never guests), the way they see who's online.
const callAnnounce = {
  send,

  update(call) {
    const event = { type: 'call.update', call: callRegistry.view(call) };
    if (call.kind === 'project') return hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : event));
    const people = new Set([...call.allowed, ...call.members.keys(), ...call.ringing.keys()]);
    for (const userId of people) hub.toUser(userId, event);
  },

  ended(call, people) {
    const event = { type: 'call.end', callId: call.id };
    if (call.kind === 'project') return hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : event));
    for (const userId of people) hub.toUser(userId, event);
  },

  ring(call, userId) {
    hub.toUser(userId, { type: 'call.ring', call: callRegistry.view(call) });
  },

  // the ring stops on every tab: answered, declined, timed out, or the caller hung up
  ringEnd(call, userId) {
    hub.toUser(userId, { type: 'call.ring.end', callId: call.id });
  },
};

export default callAnnounce;
