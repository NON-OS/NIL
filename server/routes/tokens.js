import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';

const router = express.Router();
const DAY = 86_400_000;

const list = (userId) =>
  sql.all('SELECT id, name, scope, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', userId).map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
  }));

router.get('/me/tokens', route((req) => list(req.user.id)));

// The key is shown exactly once, here. Afterwards only its hash exists.
router.post(
  '/me/tokens',
  route((req) => {
    const name = check.text(req.body?.name, 'Name', { min: 1, max: 60 });
    const scope = check.oneOf(req.body?.scope ?? 'read', ['read', 'write'], 'Access');
    const days = req.body?.days === null ? null : check.number(req.body?.days ?? 90, 'Expiry', { min: 1, max: 365, integer: true });
    if (sql.get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', req.user.id).n >= 20) throw HttpError.badRequest('You have 20 keys. Revoke one you no longer use first.');
    const token = `nonos_pat_${crypto.randomBytes(32).toString('base64url')}`;
    const now = Date.now();
    sql.run('INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), req.user.id, name, tokenHash(token), scope, now, days ? now + days * DAY : null);
    return { token, tokens: list(req.user.id) };
  }),
);

router.delete(
  '/me/tokens/:id',
  route((req) => {
    sql.run('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    return list(req.user.id);
  }),
);

export default router;
