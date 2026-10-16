import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';
import guestScope from '../services/guestScope.js';
import sharingPolicy from '../services/sharingPolicy.js';
import seatGate from '../services/seatGate.js';
import inviteIsLive from '../services/inviteIsLive.js';

const router = express.Router();
const DAY = 86_400_000;
const MAX_DAYS = 30;
const MAX_USES = 1000;

// Admins also see who came in through each link.
function toInvite(r, { withJoins = false } = {}) {
  return {
    id: r.token_hash,
    role: r.role,
    projectIds: parseJSON(r.project_ids, []),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    createdBy: r.created_by,
    reusable: r.max_uses !== 1,
    maxUses: r.max_uses,
    uses: r.uses,
    revokedAt: r.revoked_at,
    live: inviteIsLive(r),
    joined: withJoins ? sql.all('SELECT user_id AS userId, joined_at AS joinedAt FROM invite_joins WHERE invite_hash = ? ORDER BY joined_at', r.token_hash) : [],
  };
}

// Admins always invite; members too when the workspace allows it. Guests never do.
function inviter(req) {
  if (req.user.isAdmin) return 'admin';
  if (!guestScope.of(req.user.id) && sharingPolicy.get().invitePolicy === 'members') return 'member';
  throw HttpError.forbidden('Only admins can invite people to this workspace.');
}

// A reusable link has no limit (null) or a limit of at least two; anything else is single-use.
function useLimit(body, who, role) {
  if (body.reusable !== true) return 1;
  if (who !== 'admin') throw HttpError.forbidden('Only admins can make reusable invite links.');
  if (role === 'admin') throw HttpError.badRequest('Admin invites work once. Make a single-use link for each new admin.');
  if (body.maxUses === undefined || body.maxUses === null || body.maxUses === '') return null;
  return check.number(body.maxUses, 'Use limit', { min: 2, max: MAX_USES, integer: true });
}

// Admins get live links plus the ones people joined through, kept for a while after they end
// (see the purge job). Members only see their own live links.
router.get(
  '/invites',
  route((req) => {
    const who = inviter(req);
    if (who === 'admin') {
      return sql.all('SELECT * FROM invites ORDER BY created_at DESC').filter((r) => inviteIsLive(r) || r.uses > 0).map((r) => toInvite(r, { withJoins: true }));
    }
    return sql.all('SELECT * FROM invites WHERE created_by = ? ORDER BY created_at DESC', req.user.id).filter((r) => inviteIsLive(r)).map((r) => toInvite(r));
  }),
);

// The raw token is returned once and never stored; only its hash lives in the database.
// A guest invite names the projects the guest will see, and nothing else.
router.post(
  '/invites',
  route((req) => {
    const who = inviter(req);
    const role = ['admin', 'member', 'guest'].includes(req.body.role) ? req.body.role : 'member';
    if (role === 'admin' && who !== 'admin') throw HttpError.forbidden('Only admins can invite admins.');
    seatGate(role);
    const maxUses = useLimit(req.body, who, role);
    const projectIds = role === 'guest' ? [...new Set((Array.isArray(req.body.projectIds) ? req.body.projectIds : []).filter((id) => typeof id === 'string'))] : [];
    if (role === 'guest' && !projectIds.length) throw HttpError.badRequest('Pick at least one project to share with the guest.');
    for (const id of projectIds) if (!sql.get('SELECT 1 FROM projects WHERE id = ?', id)) throw HttpError.badRequest('One of those projects no longer exists.');
    const days = Math.min(Math.max(Number(req.body.days) || 7, 1), MAX_DAYS);
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    sql.run(
      'INSERT INTO invites (token_hash, role, project_ids, created_by, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?)',
      tokenHash(token), role, JSON.stringify(projectIds), req.user.id, now, now + days * DAY, maxUses,
    );
    return { token, invite: toInvite(sql.get('SELECT * FROM invites WHERE token_hash = ?', tokenHash(token)), { withJoins: who === 'admin' }) };
  }),
);

// A link nobody used goes away; one that people joined through is only switched off, so
// admins can still see who came in with it.
router.delete(
  '/invites/:id',
  route((req) => {
    const who = inviter(req);
    const row = sql.get('SELECT * FROM invites WHERE token_hash = ?', req.params.id);
    if (!row || (who !== 'admin' && row.created_by !== req.user.id)) return { ok: true };
    if (row.uses > 0) sql.run('UPDATE invites SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?', Date.now(), row.token_hash);
    else sql.run('DELETE FROM invites WHERE token_hash = ?', row.token_hash);
    return { ok: true };
  }),
);

export default router;
