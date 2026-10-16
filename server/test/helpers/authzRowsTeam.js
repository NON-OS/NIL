import actors from './authzActors.js';

const { PEOPLE, MEMBERS, ADMINS } = actors;
const none = () => 'no-such-thing';
const HOOK = { url: 'https://192.0.2.10/hook', events: ['task.assigned'] };

// Rows of the authorization matrix for bounties, payments, votes, stealth payouts and agents.
// Several need a chain or an agent run to get further than "not found"; for those the row checks
// that an allowed caller gets past the access check (a 400, 404 or 409 from the route itself)
// while everyone else is stopped before it. See authzRowsOpen.js for what a row says.
export default {
  'GET /api/bounties': { allow: PEOPLE },
  'POST /api/tasks/:id/payments/intent': { allow: ADMINS, id: 'task', ok: [400], denied: [403] },
  'POST /api/tasks/:id/payments': { allow: ADMINS, id: 'task', ok: [400], denied: [403] },
  'POST /api/payments/:id/check': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'POST /api/payments/:id/cancel': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'DELETE /api/payments/:id': { allow: ADMINS, id: none, ok: [400, 404], denied: [403] },
  'POST /api/payments/:id/announce': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'PUT /api/bounties/treasury': { allow: ADMINS, ok: [400], denied: [403] },
  'GET /api/tasks/:id/applications': { allow: ADMINS, id: 'task' },
  'POST /api/applications/:id/accept': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'POST /api/applications/:id/decline': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'GET /api/proposals': { allow: MEMBERS },
  'POST /api/proposals': { allow: ADMINS, body: { title: 'Another vote', options: ['Yes', 'No'] } },
  'POST /api/proposals/:id/ballot': { allow: MEMBERS, id: 'proposal', ok: [400, 404], denied: [403] },
  'POST /api/proposals/:id/vote': { allow: MEMBERS, id: 'proposal', ok: [400], denied: [403] },
  'POST /api/proposals/:id/close': { allow: ADMINS, id: 'fresh.proposal' },
  'GET /api/proposals/:id/audit': { allow: ADMINS, id: 'proposal' },
  'DELETE /api/proposals/:id': { allow: ADMINS, id: 'fresh.proposal' },
  'GET /api/vote-power': { allow: MEMBERS },
  'PUT /api/vote-power': { allow: ADMINS, ok: [400], denied: [403] },
  'PUT /api/me/semaphore': { allow: MEMBERS, ok: [400], denied: [403] },
  'PUT /api/proposals/:id/commitment': { allow: MEMBERS, id: 'proposal', ok: [400, 404], denied: [403] },
  'PUT /api/proposals/:id/dealing': { allow: MEMBERS, id: 'proposal', ok: [400, 404], denied: [403] },
  'POST /api/proposals/:id/shares-check': { allow: MEMBERS, id: 'proposal', ok: [400, 404], denied: [403] },
  'POST /api/proposals/:id/partial': { allow: MEMBERS, id: 'proposal', ok: [400, 404], denied: [403] },
  'GET /api/holder-gate': { allow: MEMBERS },
  'PUT /api/holder-gate': { allow: ADMINS, body: {} },
  'PUT /api/me/stealth': { allow: PEOPLE, ok: [400] },
  'DELETE /api/me/stealth': { allow: PEOPLE },
  'GET /api/stealth/payouts': { allow: PEOPLE, ok: [400] },
  'GET /api/stealth/payouts/:id/balance': { allow: PEOPLE, id: none, ok: [400, 404] },
  'POST /api/stealth/prepare': { allow: PEOPLE, ok: [400] },
  'POST /api/stealth/broadcast': { allow: PEOPLE, ok: [400] },
  'GET /api/agents': { allow: MEMBERS },
  'POST /api/agents': { allow: ADMINS, body: () => ({ name: `Helper ${Math.random().toString(36).slice(2, 8)}`, access: 'read', runner: 'external' }) },
  'PATCH /api/agents/:id': { allow: ADMINS, id: 'spareAgent', body: { description: 'Edited' } },
  'POST /api/agents/:id/pause': { allow: ADMINS, id: 'spareAgent' },
  'POST /api/agents/:id/resume': { allow: ADMINS, id: 'spareAgent' },
  'POST /api/agents/:id/key': { allow: ADMINS, id: 'spareAgent' },
  'DELETE /api/agents/:id': { allow: ADMINS, id: 'fresh.agent' },
  'PUT /api/agent-settings': { allow: ADMINS, body: { enabled: true } },
  // a documentation address: saving it is refused by the outbound-address check, after the access check
  'PUT /api/agents/:id/webhook': { allow: ADMINS, id: 'spareAgent', body: HOOK, ok: [400], denied: [403] },
  'POST /api/agents/:id/webhook/secret': { allow: ADMINS, id: 'spareAgent', ok: [400, 404], denied: [403] },
  'POST /api/agents/:id/webhook/enable': { allow: ADMINS, id: 'spareAgent', ok: [400, 404], denied: [403] },
  'DELETE /api/agents/:id/webhook': { allow: ADMINS, id: 'spareAgent' },
  'POST /api/agents/:id/webhook/test': { allow: ADMINS, id: 'spareAgent', ok: [400], denied: [403] },
  'GET /api/agents/:id/webhook/deliveries': { allow: ADMINS, id: 'spareAgent' },
  'POST /api/webhook-deliveries/:id/redeliver': { allow: ADMINS, id: none, ok: [404], denied: [403] },
  'GET /api/tasks/:id/agent-activity': { allow: PEOPLE, id: 'task' },
  'GET /api/agents/:id/runs': { allow: ADMINS, id: 'spareAgent' },
  'GET /api/agent-runs/:id': { allow: PEOPLE, id: none, ok: [404] },
  'POST /api/agent-runs/:id/cancel': { allow: ADMINS, id: none, ok: [409], denied: [403] },
  'GET /api/agents/:id/audit': { allow: ADMINS, id: 'spareAgent' },
  'GET /api/agent-approvals': { allow: PEOPLE },
  'POST /api/agent-approvals/:id/approve': { allow: PEOPLE, id: none, ok: [404] },
  'POST /api/agent-approvals/:id/decline': { allow: PEOPLE, id: none, ok: [404] },
};
