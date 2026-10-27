import config from '../config.js';
import callRegistry from './callRegistry.js';
import callMembership from './callMembership.js';
import callAnnounce from './callAnnounce.js';

const ID = /^[A-Za-z0-9_-]{1,32}$/;
// a random name each tab gives itself for a call, so the others can tell a reload from a rejoin
const SESSION = /^[A-Za-z0-9_-]{8,43}$/;

const valid = (value, pattern) => typeof value === 'string' && pattern.test(value);

// The call messages on the live connection: join, leave, decline, and the handshake between two
// browsers. The handshake is an opaque blob the server only measures and passes on, and only
// between two people in the same call. Anything else about a call, or about a call someone isn't
// in, is dropped without an answer, so the socket can't be used to find out which calls exist.
export default function callSocket(ws, client, msg) {
  if (!config.calls.enabled || !valid(msg.callId, ID)) return;
  const userId = client.userId;
  if (msg.type === 'call.join') {
    if (!valid(msg.session, SESSION)) return;
    const { call, error } = callMembership.join({ callId: msg.callId, userId, ws, session: msg.session, resume: msg.resume === true, projectId: msg.projectId });
    if (error) return callAnnounce.send(ws, { type: 'call.refused', callId: msg.callId, reason: error });
    return callAnnounce.send(ws, { type: 'call.joined', call: callRegistry.view(call) });
  }
  const call = callRegistry.get(msg.callId);
  if (!call) return;
  if (msg.type === 'call.leave') {
    if (call.members.get(userId)?.ws === ws) callMembership.leave(call, userId);
  } else if (msg.type === 'call.decline') {
    callMembership.decline(call, userId);
  } else if (msg.type === 'call.signal') {
    if (!valid(msg.to, ID) || typeof msg.blob !== 'string' || msg.blob.length > config.calls.maxSignalBytes) return;
    if (callMembership.relay(call, userId, ws, msg.to, msg.blob) === 'limited') callAnnounce.send(ws, { type: 'call.limited', callId: call.id });
  }
}

callSocket.closed = (ws) => callMembership.socketClosed(ws);
