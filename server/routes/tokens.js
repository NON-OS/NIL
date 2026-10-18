import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';
import confirmedSession from '../auth/confirmedSession.js';
import config from '../config.js';

const router = express.Router();
const DAY = 86_400_000;

// A key made before keys had to expire runs out once it's as old as the longest a key may last.
const list = (userId) =>
  sql.all('SELECT id, name, scope, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC', userId).map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope,
    createdAt: r.created_at,
    expiresAt: Math.min(r.expires_at ?? Infinity, r.created_at + config.signIn.accessKeyMaxDays * DAY),
    lastUsedAt: r.last_used_at,
  }));

router.get('/me/tokens', route((req) => list(req.user.id)));

// The key is shown exactly once, here. Afterwards only its hash exists. A key outlives the
// session it's made in, so making one needs a linked wallet's confirmation, and every key expires.
router.post(
  '/me/tokens',
  route((req) => {
    const name = check.text(req.body?.name, 'Name', { min: 1, max: 60 });
    const scope = check.oneOf(req.body?.scope ?? 'read', ['read', 'write'], 'Access');
    const maxDays = config.signIn.accessKeyMaxDays;
    if (req.body?.days === null) throw HttpError.badRequest(`Keys can last at most ${maxDays} days here. Pick when this one expires.`);
    const days = check.number(req.body?.days ?? Math.min(90, maxDays), 'Expiry', { min: 1, max: maxDays, integer: true });
    if (sql.get('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', req.user.id).n >= 20) throw HttpError.badRequest('You have 20 keys. Revoke one you no longer use first.');
    confirmedSession(req);
    const token = `nonos_pat_${crypto.randomBytes(32).toString('base64url')}`;
    const now = Date.now();
    sql.run('INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), req.user.id, name, tokenHash(token), scope, now, now + days * DAY);
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
