import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import tokenHash from '../auth/tokenHash.js';

const router = express.Router();
router.use('/invites', requireAdmin);

const toInvite = (r) => ({ id: r.token_hash, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at, createdBy: r.created_by });

router.get(
  '/invites',
  route(() => sql.all('SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC', Date.now()).map(toInvite)),
);

// The raw token is returned once and never stored; only its hash lives in the database.
router.post(
  '/invites',
  route((req) => {
    const role = req.body.role === 'admin' ? 'admin' : 'member';
    const email = req.body.email ? check.email(req.body.email) : null;
    if (email && sql.get('SELECT 1 FROM users WHERE email = ?', email)) throw HttpError.badRequest('That person is already in the workspace.');
    const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 30);
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    sql.run(
      'INSERT INTO invites (token_hash, email, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      tokenHash(token), email, role, req.user.id, now, now + days * 86_400_000,
    );
    return { token, invite: toInvite(sql.get('SELECT * FROM invites WHERE token_hash = ?', tokenHash(token))) };
  }),
);

router.delete(
  '/invites/:id',
  route((req) => {
    sql.run('DELETE FROM invites WHERE token_hash = ?', req.params.id);
    return { ok: true };
  }),
);

export default router;
