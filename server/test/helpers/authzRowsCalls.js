import actors from './authzActors.js';

const { MEMBERS, ADMINS } = actors;
const IN_CALL = ['admin', 'owner'];

// Rows of the authorization matrix for calls, against a real call the owner started with the
// admin. The member is on the team but wasn't asked in, so the call doesn't exist for them (404),
// the same as for a made-up id; guests are refused before any of it. The call messages on the
// live connection are checked in attackCalls.test.js.
export default {
  'GET /api/calls/settings': { allow: MEMBERS },
  'PUT /api/calls/settings': { allow: ADMINS, body: { direct: false }, denied: [403] },
  'GET /api/calls': { allow: MEMBERS },
  'POST /api/calls': { allow: MEMBERS, body: { with: ['no-such-person'] }, ok: [400], denied: [403] },
  'GET /api/calls/blocks': { allow: MEMBERS },
  'PUT /api/calls/blocks': { allow: MEMBERS, body: { dnd: false }, denied: [403] },
  // asking someone in takes being in the call over the live connection first
  'POST /api/calls/:id/invite': { allow: IN_CALL, id: 'fresh.call', body: { userIds: ['no-such-person'] }, ok: [409], denied: [403, 404] },
  'POST /api/calls/:id/turn': { allow: IN_CALL, id: 'fresh.call', denied: [403, 404] },
  // a room token needs being in the call and the call being on an SFU, which this server has none of
  'POST /api/calls/:id/sfu': { allow: IN_CALL, id: 'fresh.call', ok: [409], denied: [403, 404] },
};
