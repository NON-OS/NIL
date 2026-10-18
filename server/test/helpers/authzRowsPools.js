import actors from './authzActors.js';

const { ADMINS } = actors;
const none = () => 'no-such-thing';

// Rows of the authorization matrix for private bounty payouts through Privacy Pools. Only admins
// get past the access check. The matrix server runs with the feature off, so an admin's answer
// is the 404 that says so, while members, guests and agents are stopped with a 403 first;
// poolRoutes.test.js runs the same routes with the feature on.
export default {
  'GET /api/pools': { allow: ADMINS, ok: [404], denied: [403] },
  'GET /api/pools/:symbol/sets': { allow: ADMINS, symbol: () => 'USDC', ok: [404], denied: [403] },
  'POST /api/pools/:symbol/review': { allow: ADMINS, symbol: () => 'USDC', body: { labels: ['1'] }, ok: [404], denied: [403] },
  'GET /api/pools/receipts/:txHash': { allow: ADMINS, txHash: () => `0x${'ab'.repeat(32)}`, ok: [404], denied: [403] },
  'POST /api/pools/:symbol/events': { allow: ADMINS, symbol: () => 'USDC', body: { fromBlock: 1, toBlock: 2 }, ok: [404], denied: [403] },
  'POST /api/pool-payouts/:intentId/quote': { allow: ADMINS, intentId: none, ok: [404], denied: [403] },
  'POST /api/pool-payouts/:intentId/relay': { allow: ADMINS, intentId: none, ok: [404], denied: [403] },
  'GET /api/pool-account': { allow: ADMINS, ok: [404], denied: [403] },
  'POST /api/pool-account': { allow: ADMINS, body: {}, ok: [404], denied: [403] },
  'PUT /api/pool-account/keys': { allow: ADMINS, body: { grants: [] }, ok: [404], denied: [403] },
  'PUT /api/pool-account/notes': { allow: ADMINS, body: { notes: 'x', rev: 1 }, ok: [404], denied: [403] },
};
