import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import parseJSON from '../lib/parseJSON.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';
import guestScope from '../services/guestScope.js';
import sharingPolicy from '../services/sharingPolicy.js';
import seatGate from '../services/seatGate.js';

const router = express.Router();
const DAY = 86_400_000;

const toInvite = (r) => ({ id: r.token_hash, role: r.role, projectIds: parseJSON(r.project_ids, []), createdAt: r.created_at, expiresAt: r.expires_at, createdBy: r.created_by });

// Admins always invite; members too when the workspace allows it. Guests never do.
function inviter(req) {
  if (req.user.isAdmin) return 'admin';
  if (!guestScope.of(req.user.id) && sharingPolicy.get().invitePolicy === 'members') return 'member';
  throw HttpError.forbidden('Only admins can invite people to this workspace.');
}

router.get(
  '/invites',
  route((req) => {
    const who = inviter(req);
    const rows = who === 'admin'
      ? sql.all('SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC', Date.now())
      : sql.all('SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? AND created_by = ? ORDER BY created_at DESC', Date.now(), req.user.id);
    return rows.map(toInvite);
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
    const projectIds = role === 'guest' ? [...new Set((Array.isArray(req.body.projectIds) ? req.body.projectIds : []).filter((id) => typeof id === 'string'))] : [];
    if (role === 'guest' && !projectIds.length) throw HttpError.badRequest('Pick at least one project to share with the guest.');
    for (const id of projectIds) if (!sql.get('SELECT 1 FROM projects WHERE id = ?', id)) throw HttpError.badRequest('One of those projects no longer exists.');
    const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 30);
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    sql.run(
      'INSERT INTO invites (token_hash, role, project_ids, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      tokenHash(token), role, JSON.stringify(projectIds), req.user.id, now, now + days * DAY,
    );
    return { token, invite: toInvite(sql.get('SELECT * FROM invites WHERE token_hash = ?', tokenHash(token))) };
  }),
);

router.delete(
  '/invites/:id',
  route((req) => {
    const who = inviter(req);
    if (who === 'admin') sql.run('DELETE FROM invites WHERE token_hash = ?', req.params.id);
    else sql.run('DELETE FROM invites WHERE token_hash = ? AND created_by = ?', req.params.id, req.user.id);
    return { ok: true };
  }),
);

export default router;
