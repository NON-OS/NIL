import callRegistry from './callRegistry.js';
import callBus from './callBus.js';

const peopleOf = (call) => [...call.people.keys()];

// Who hears about changes to a call: everyone in it or asked into it, and for a project call
// the whole team (never guests), the way they see who's online.
const callAnnounce = {
  send: (ws, event) => callBus.send(ws, JSON.stringify(event)),

  update(call) {
    const event = { type: 'call.update', call: callRegistry.view(call) };
    if (call.kind === 'project') return callBus.team(event);
    for (const userId of peopleOf(call)) callBus.user(userId, event);
  },

  ended(call) {
    const event = { type: 'call.end', callId: call.id };
    if (call.kind === 'project') return callBus.team(event);
    for (const userId of peopleOf(call)) callBus.user(userId, event);
  },

  ring: (call, userId) => callBus.user(userId, { type: 'call.ring', call: callRegistry.view(call) }),

  // the ring stops on every tab: answered, declined, timed out, or the caller hung up
  ringEnd: (call, userId) => callBus.user(userId, { type: 'call.ring.end', callId: call.id }),

  // to the tab one person joined from
  member: (call, person, event) => callBus.member(call.id, person.user_id, person.session, event, { instance: person.instance }),
};

export default callAnnounce;
