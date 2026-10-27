import actors from './authzActors.js';

const { MEMBERS, ADMINS } = actors;
const none = () => 'no-such-call';

// Rows of the authorization matrix for calls. The matrix's server has no relay set up, so
// starting a call or asking for relay passwords stops at 409 for those allowed; a call id nobody
// is in gets 404, the same as one that doesn't exist. Guests are refused before any of it.
export default {
  'GET /api/calls/settings': { allow: MEMBERS },
  'PUT /api/calls/settings': { allow: ADMINS, body: { direct: false }, denied: [403] },
  'GET /api/calls': { allow: MEMBERS },
  'POST /api/calls': { allow: MEMBERS, body: { with: ['no-such-person'] }, ok: [409], denied: [403] },
  'POST /api/calls/:id/invite': { allow: MEMBERS, id: none, body: { userIds: ['no-such-person'] }, ok: [404], denied: [403] },
  'POST /api/calls/:id/turn': { allow: MEMBERS, id: none, ok: [409], denied: [403] },
};
