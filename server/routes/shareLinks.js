import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';
import requireAdmin from '../auth/requireAdmin.js';
import sharingPolicy from '../services/sharingPolicy.js';
import shareTarget from '../services/shareTarget.js';

const router = express.Router();
const DAY = 86_400_000;

const toLink = (r) => ({ id: r.id, kind: r.kind, targetId: r.target_id, createdBy: r.created_by, createdAt: r.created_at, expiresAt: r.expires_at, views: r.views, lastViewedAt: r.last_viewed_at });

router.get('/sharing', route(() => sharingPolicy.get()));
router.put('/sharing', requireAdmin, route((req) => sharingPolicy.set(req.body ?? {})));

router.get(
  '/share-links',
  route((req) => {
    const kind = check.oneOf(req.query.kind, ['project', 'task'], 'Kind');
    return sql.all('SELECT * FROM share_links WHERE kind = ? AND target_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC', kind, String(req.query.targetId ?? ''), Date.now()).map(toLink);
  }),
);

// The secret part of the link is returned once; the server keeps only its hash.
router.post(
  '/share-links',
  route((req) => {
    if (!sharingPolicy.get().shareLinks) throw HttpError.forbidden('Share links are turned off for this workspace. An admin can turn them on in Settings → Team.');
    const kind = req.body?.kind;
    const targetId = String(req.body?.targetId ?? '');
    shareTarget(kind, targetId, req.user);
    const days = check.number(req.body?.days ?? 30, 'Expiry', { min: 1, max: 365, integer: true });
    const token = crypto.randomBytes(24).toString('base64url');
    const id = newId();
    sql.run('INSERT INTO share_links (id, token_hash, kind, target_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, tokenHash(token), kind, targetId, req.user.id, Date.now(), Date.now() + days * DAY);
    return { token, link: toLink(sql.get('SELECT * FROM share_links WHERE id = ?', id)) };
  }),
);

router.delete(
  '/share-links/:id',
  route((req) => {
    const row = sql.get('SELECT * FROM share_links WHERE id = ?', req.params.id);
    if (!row) return { ok: true };
    if (row.created_by !== req.user.id && !req.user.isAdmin) throw HttpError.forbidden('Only whoever made the link or an admin can revoke it.');
    sql.run('UPDATE share_links SET revoked_at = ? WHERE id = ?', Date.now(), row.id);
    return { ok: true };
  }),
);

export default router;
