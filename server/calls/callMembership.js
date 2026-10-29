import config from '../config.js';
import callRegistry from './callRegistry.js';
import callAnnounce from './callAnnounce.js';
import callSockets from './callSockets.js';
import callInstance from './callInstance.js';
import callLimits from './callLimits.js';
import callRing from './callRing.js';
import callable from './callable.js';
import callBlocks from './callBlocks.js';
import sfuRooms from './sfuRooms.js';

const seconds = (n) => n * 1000;

// Changes a call the way the people in it need: everyone hears the new state, and a call that
// grew past what a mesh carries moves to the SFU.
function changed(callId) {
  const call = callRegistry.get(callId);
  if (!call) return null;
  if (callLimits.wantsSfu(call, callRegistry.members(call).length)) {
    callRegistry.setMode(call.id, 'sfu');
    call.mode = 'sfu';
  }
  callAnnounce.update(call);
  return call;
}

function stopRinging(call, userId, { missed }) {
  if (call.people.get(userId)?.state !== 'ringing') return;
  callRegistry.put(call.id, userId, { state: 'allowed', ring_until: null });
  callAnnounce.ringEnd(call, userId);
  if (missed) callRing(userId, call.id, { missed: true });
}

const callMembership = {
  end(call) {
    if (!callRegistry.remove(call.id)) return;
    if (call.mode === 'sfu') sfuRooms.close(call.id);
    for (const p of callRegistry.ringing(call)) {
      callAnnounce.ringEnd(call, p.user_id);
      callRing(p.user_id, call.id, { missed: true });
    }
    for (const p of callRegistry.members(call)) callSockets.drop(call.id, p.user_id);
    callAnnounce.ended(call);
  },

  // A new call, with its first ring out. The person who started it joins over their socket
  // next; a call nobody joins in time is dropped (callSweep).
  start({ by, kind, projectId = null, invite = [] }) {
    const call = callRegistry.create({ by, kind, projectId });
    callMembership.invite(call, by, invite);
    if (kind === 'project') callAnnounce.update(call);
    return callRegistry.get(call.id);
  },

  // Rings people, up to the size a call may reach. Returns who was rung.
  invite(call, by, userIds) {
    const rung = [];
    let taken = callRegistry.members(call).length + callRegistry.ringing(call).length + (callRegistry.member(call, by) ? 0 : 1);
    for (const userId of new Set(userIds)) {
      const state = call.people.get(userId)?.state;
      if (userId === by || state === 'member' || state === 'ringing' || !callable(userId)) continue;
      if (taken >= callLimits.max()) break;
      taken += 1;
      // someone who blocked the caller, isn't taking calls or was rung too often by them is
      // asked in without a ring: the caller hears no answer, and they can still join
      if (!callBlocks.mayRing(by, userId)) {
        callRegistry.put(call.id, userId, { state: 'allowed' });
        continue;
      }
      callRegistry.put(call.id, userId, { state: 'ringing', ring_until: Date.now() + seconds(config.calls.ringSeconds) });
      callAnnounce.ring(callRegistry.get(call.id), userId);
      callRing(userId, call.id);
      rung.push(userId);
    }
    if (rung.length) changed(call.id);
    return rung;
  },

  decline(call, userId) {
    if (call.people.get(userId)?.state !== 'ringing') return;
    stopRinging(call, userId, { missed: false });
    for (const p of callRegistry.members(call)) callAnnounce.member(call, p, { type: 'call.declined', callId: call.id, userId });
    const now = changed(call.id);
    if (now && !callRegistry.members(now).length && !callRegistry.ringing(now).length) callMembership.end(now);
  },

  // Takes one socket into a call. Joining again from another tab moves the person there, and
  // the tab they left is told. Returns the call, or why not.
  join({ callId, userId, ws, session }) {
    if (!callable(userId)) return { error: 'gone' };
    const call = callRegistry.get(callId);
    // a call someone may not join looks the same as one that doesn't exist
    if (!call || !callRegistry.mayJoin(call, userId)) return { error: 'gone' };
    const now = Date.now();
    const current = callRegistry.member(call, userId);
    if (!current && callRegistry.members(call).length >= callLimits.max()) return { error: 'full' };
    const left = callSockets.bind(call.id, userId, ws, session);
    if (left) callAnnounce.send(left.ws, { type: 'call.replaced', callId: call.id });
    // the tab they left goes from the SFU too
    if (current && current.session !== session && call.mode === 'sfu') sfuRooms.remove(call.id, userId, current.session);
    else if (current?.connected && current.instance !== callInstance.id) callAnnounce.member(call, current, { type: 'call.replaced', callId: call.id });
    callRegistry.put(call.id, userId, { state: 'member', ring_until: null, session, joined_at: current?.joined_at ?? now, instance: callInstance.id, connected: 1, seen_at: now });
    if (call.people.get(userId)?.state === 'ringing') callAnnounce.ringEnd(call, userId);
    callRegistry.refresh(call.id, now);
    // the same tab back after a dropped connection changes nothing anyone else sees
    if (current && current.session === session) return { call: callRegistry.get(call.id) };
    return { call: changed(call.id) };
  },

  leave(call, userId) {
    const person = callRegistry.member(call, userId);
    if (!person) return;
    if (call.mode === 'sfu') sfuRooms.remove(call.id, userId, person.session);
    callRegistry.put(call.id, userId, { state: 'allowed', session: null, instance: null, connected: 0 });
    callSockets.drop(call.id, userId);
    const now = callRegistry.get(call.id);
    if (!callRegistry.members(now).length) return callMembership.end(now);
    changed(call.id);
  },

  // A socket that closed keeps its place for a while (callSweep), since the browsers in the call
  // are still connected to each other and the tab is likely to reconnect. Someone removed from
  // the team is out at once.
  socketClosed(ws) {
    for (const s of callSockets.release(ws)) {
      const call = callRegistry.get(s.callId);
      const person = call && callRegistry.member(call, s.userId);
      if (!person || person.session !== s.session || person.instance !== callInstance.id) continue;
      if (!callable(s.userId)) callMembership.leave(call, s.userId);
      else callRegistry.put(call.id, s.userId, { connected: 0, seen_at: Date.now() });
    }
  },

  // Passes one opaque handshake message between two people in the same call, from the socket
  // that joined to the tab that joined. Each person has a budget a minute.
  relay(call, from, ws, to, blob) {
    const sender = callSockets.get(call.id, from);
    const target = to === from ? null : callRegistry.member(call, to);
    if (!sender || sender.ws !== ws || !target?.session || !callRegistry.member(call, from)) return 'dropped';
    const now = Date.now();
    if (now - sender.budget.start > 60_000) sender.budget = { start: now, count: 0 };
    if (++sender.budget.count > config.calls.signalsPerMinute) return 'limited';
    callAnnounce.member(call, target, { type: 'call.signal', callId: call.id, from, blob });
    return 'sent';
  },
};

export default callMembership;
