import config from '../config.js';
import sql from '../db/sql.js';
import callRegistry from './callRegistry.js';
import callAnnounce from './callAnnounce.js';
import callRing from './callRing.js';
import callable from './callable.js';

const SERVER_START = Date.now();
const seconds = (n) => n * 1000;

function end(call) {
  const people = new Set([...call.allowed, ...call.members.keys(), ...call.ringing.keys()]);
  for (const userId of call.ringing.keys()) {
    callAnnounce.ringEnd(call, userId);
    callRing(userId, call.id, { missed: true });
  }
  callRegistry.remove(call);
  callAnnounce.ended(call, people);
}

function stopRinging(call, userId, { missed }) {
  const ring = call.ringing.get(userId);
  if (!ring) return;
  clearTimeout(ring.timer);
  call.ringing.delete(userId);
  callAnnounce.ringEnd(call, userId);
  if (missed) callRing(userId, call.id, { missed: true });
}

// After a restart the server has forgotten every call, while the people in one are still
// talking browser to browser. For a short while they may take the call back by its id.
function restore(callId, userId, projectId) {
  const until = SERVER_START + seconds(config.calls.rejoinSeconds) * 2;
  if (Date.now() > until || !/^[A-Za-z0-9_-]{12}$/.test(callId)) return null;
  const project = typeof projectId === 'string' && projectId.length <= 32 ? sql.get('SELECT id FROM projects WHERE id = ?', projectId)?.id ?? null : null;
  return callRegistry.restore(callId, userId, until, project);
}

const callMembership = {
  // A new call, with its first ring out. The person who started it joins over their socket
  // next; a call nobody joins in time is dropped.
  start({ by, kind, projectId = null, invite = [] }) {
    const call = callRegistry.create({ by, kind, projectId });
    call.timer = setTimeout(() => call.members.size === 0 && callRegistry.get(call.id) === call && end(call), seconds(config.calls.ringSeconds)).unref();
    callMembership.invite(call, by, invite);
    if (kind === 'project') callAnnounce.update(call);
    return call;
  },

  // Rings people, up to the size a call may reach. Returns who was rung.
  invite(call, by, userIds) {
    const rung = [];
    for (const userId of new Set(userIds)) {
      if (userId === by || call.members.has(userId) || call.ringing.has(userId) || !callable(userId)) continue;
      if (call.members.size + call.ringing.size + (call.members.has(by) ? 0 : 1) >= config.calls.maxPeers) break;
      call.allowed.add(userId);
      const timer = setTimeout(() => {
        stopRinging(call, userId, { missed: true });
        callAnnounce.update(call);
        if (call.members.size === 0 && call.ringing.size === 0 && callRegistry.get(call.id) === call) end(call);
      }, seconds(config.calls.ringSeconds)).unref();
      call.ringing.set(userId, { at: Date.now(), timer });
      callAnnounce.ring(call, userId);
      callRing(userId, call.id);
      rung.push(userId);
    }
    if (rung.length) callAnnounce.update(call);
    return rung;
  },

  decline(call, userId) {
    if (!call.ringing.has(userId)) return;
    stopRinging(call, userId, { missed: false });
    for (const m of call.members.values()) callAnnounce.send(m.ws, { type: 'call.declined', callId: call.id, userId });
    callAnnounce.update(call);
    if (call.members.size === 0 && call.ringing.size === 0) end(call);
  },

  // Takes one socket into a call. Joining again from another tab moves the person there, and
  // the tab they left is told. Returns the call, or why not.
  join({ callId, userId, ws, session, resume = false, projectId = null }) {
    if (!callable(userId)) return { error: 'gone' };
    let call = callRegistry.get(callId);
    if (!call && resume) call = restore(callId, userId, projectId);
    // a call someone may not join looks the same as one that doesn't exist
    if (!call || !callRegistry.mayJoin(call, userId)) return { error: 'gone' };
    const current = call.members.get(userId);
    if (current) {
      clearTimeout(current.dropTimer);
      current.dropTimer = null;
      if (current.ws && current.ws !== ws) callAnnounce.send(current.ws, { type: 'call.replaced', callId: call.id });
      const moved = current.session !== session;
      Object.assign(current, { ws, session });
      if (moved) callAnnounce.update(call);
      return { call };
    }
    if (call.members.size >= config.calls.maxPeers) return { error: 'full' };
    call.members.set(userId, { ws, session, joinedAt: Date.now(), dropTimer: null, budget: { start: Date.now(), count: 0 } });
    call.allowed.add(userId);
    clearTimeout(call.timer);
    stopRinging(call, userId, { missed: false });
    callAnnounce.update(call);
    return { call };
  },

  leave(call, userId) {
    const member = call.members.get(userId);
    if (!member) return;
    clearTimeout(member.dropTimer);
    call.members.delete(userId);
    if (call.members.size === 0) return end(call);
    callAnnounce.update(call);
  },

  // A socket that closed keeps its place for a while, since the browsers in the call are still
  // connected to each other and the tab is likely to reconnect.
  socketClosed(ws) {
    for (const call of callRegistry.withSocket(ws)) {
      for (const [userId, member] of call.members) {
        if (member.ws !== ws) continue;
        member.ws = null;
        member.dropTimer = setTimeout(() => callRegistry.get(call.id) === call && callMembership.leave(call, userId), seconds(config.calls.rejoinSeconds)).unref();
      }
    }
  },

  // Passes one opaque handshake message between two people in the same call, from the socket
  // that joined to the socket that joined. Each person has a budget a minute.
  relay(call, from, ws, to, blob) {
    const sender = call.members.get(from);
    const target = to === from ? null : call.members.get(to);
    if (!sender || sender.ws !== ws || !target?.ws) return 'dropped';
    const now = Date.now();
    if (now - sender.budget.start > 60_000) sender.budget = { start: now, count: 0 };
    if (++sender.budget.count > config.calls.signalsPerMinute) return 'limited';
    callAnnounce.send(target.ws, { type: 'call.signal', callId: call.id, from, blob });
    return 'sent';
  },
};

export default callMembership;
