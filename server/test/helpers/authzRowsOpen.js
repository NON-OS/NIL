import wallet from './wallet.js';
import actors from './authzActors.js';

const { ALL, PEOPLE, ADMINS, NOBODY } = actors;

// Rows of the authorization matrix for the routes that answer before sign-in, plus the session
// basics. Each row: who is allowed; what the path points at; the body; and, where a 2xx can't
// be had without a chain or a real file, the status an allowed caller gets instead. A row
// marked `open` sits before the sign-in check, so signed-out callers aren't simply turned away.
export default {
  'GET /api/auth/state': { open: true, allow: ALL },
  'POST /api/auth/logout': { open: true, allow: ALL, session: 'fresh' },
  'GET /api/auth/invite/:token': { open: true, allow: ALL, token: 'inviteToken' },
  'GET /api/auth/reset/:token': { open: true, allow: ALL, token: () => 'no-such-reset' },
  'GET /api/public/share/:token': { open: true, allow: ALL, token: 'shareToken' },
  'GET /api/public/bounties': { open: true, allow: ALL },
  // a task nobody listed on the board: unknown to everyone, signed in or not
  'POST /api/public/bounties/:id/challenge': { open: true, allow: NOBODY, id: 'task', denied: [404] },
  'POST /api/public/bounties/:id/apply': { open: true, allow: NOBODY, id: 'task', denied: [400, 404] },
  'POST /api/auth/wallet/challenge': { open: true, allow: ALL, body: () => ({ address: wallet().address, mode: 'login' }) },
  // a wallet that signs correctly but has no account here gets nothing
  'POST /api/auth/wallet/verify': {
    open: true,
    allow: NOBODY,
    denied: [404],
    body: async ({ world }) => {
      const w = wallet();
      const res = await fetch(`${world.base()}/api/auth/wallet/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: JSON.stringify({ address: w.address, mode: 'login' }) });
      const { challengeId, message } = await res.json();
      return { challengeId, signature: w.sign(message) };
    },
  },
  'GET /api/proofs/key': { open: true, allow: ALL },
  'POST /api/auth/restore': { open: true, allow: NOBODY, denied: [409] },
  'POST /api/anonymous-ballots/:id': { open: true, allow: NOBODY, id: 'proposal', denied: [404] },
  'GET /api/calendar/:file': { open: true, allow: ALL, file: ({ t }) => t.fresh.calendarFile() },
  'POST /api/export/capsule': { allow: ADMINS, body: { passphrase: 'a long enough passphrase' } },
  'GET /api/bootstrap': { allow: PEOPLE },
  'PATCH /api/me': { allow: PEOPLE, body: { title: 'Tester' } },
  'POST /api/me/sign-out-everywhere': { allow: PEOPLE, session: 'fresh', last: true },
  'GET /api/me/credentials': { allow: PEOPLE },
  'PATCH /api/me/credentials/:id': { allow: PEOPLE, id: 'own.mainCredential', body: { label: 'Backup' } },
  'DELETE /api/me/credentials/:id': { allow: PEOPLE, id: 'own.credential' },
  'PATCH /api/me/privacy': { allow: PEOPLE, body: { shareWallet: false } },
  'GET /api/proofs/mine': { allow: PEOPLE },
  'GET /api/privacy': { allow: PEOPLE },
  'PATCH /api/privacy': { allow: ADMINS, body: {} },
  // the owner gets as far as the confirmation, which is deliberately wrong here
  'POST /api/privacy/wipe': { allow: ['owner'], body: { confirm: 'not the name' }, ok: [400] },
  'PATCH /api/workspace': { allow: ADMINS, body: { name: 'Matrix' } },
  'PATCH /api/users/:id': { allow: ADMINS, id: 'ids.member', body: {} },
  'GET /api/users/:id/projects': { allow: ADMINS, id: 'ids.guest' },
  'DELETE /api/users/:id': { allow: ADMINS, id: 'fresh.removedUser' },
  'GET /api/invites': { allow: ADMINS },
  'POST /api/invites': { allow: ADMINS, body: { role: 'member' } },
  'DELETE /api/invites/:id': { allow: ADMINS, id: 'fresh.invite' },
  'GET /api/sharing': { allow: PEOPLE },
  'PUT /api/sharing': { allow: ADMINS, body: { shareLinks: true } },
  'GET /api/plan': { allow: PEOPLE },
  'GET /api/plan/quote': { allow: ADMINS, ok: [400] },
  'GET /api/plan/invoices': { allow: ADMINS },
  'POST /api/plan/invoices': { allow: ADMINS, ok: [400] },
  'GET /api/plan/invoices/:id': { allow: ADMINS, id: () => 'no-such-invoice', ok: [404] },
  'POST /api/plan/invoices/:id/transactions': { allow: ADMINS, id: () => 'no-such-invoice', ok: [400, 404] },
  'POST /api/plan/invoices/:id/check': { allow: ADMINS, id: () => 'no-such-invoice', ok: [404] },
  'POST /api/plan/invoices/:id/cancel': { allow: ADMINS, id: () => 'no-such-invoice', ok: [404] },
  'POST /api/plan/invoices/:id/retry': { allow: ADMINS, id: () => 'no-such-invoice', ok: [400, 404] },
  'GET /api/plan/revenue': { allow: ADMINS },
  'GET /api/sign-in-resets': { allow: ADMINS },
  'POST /api/users/:id/sign-in-reset': { allow: ADMINS, id: 'ids.member' },
  // a member's reset needs no second admin, so approving it is refused by the route itself
  'POST /api/sign-in-resets/:id/approve': { allow: ADMINS, id: 'fresh.reset', ok: [400], denied: [403] },
  'DELETE /api/sign-in-resets/:id': { allow: ADMINS, id: 'fresh.reset' },
  'GET /api/first-run': { allow: PEOPLE },
  'PATCH /api/first-run': { allow: PEOPLE, body: { dismissed: true } },
  'POST /api/first-run/sample': { allow: ['owner'], body: {} },
  'DELETE /api/first-run/sample': { allow: ['owner'] },
};
