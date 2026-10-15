import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import tokenHash from '../auth/tokenHash.js';
import rateLimit from '../auth/rateLimit.js';
import sharingPolicy from '../services/sharingPolicy.js';
import publicShare from '../services/publicShare.js';

const router = express.Router();
router.use('/public', rateLimit({ windowMs: 60_000, max: 60 }));

// Read-only pages anyone with the secret link can open, without signing in. Search engines
// are asked not to index them, and every one dies the moment its link is revoked or expires.
router.get(
  '/public/share/:token',
  route((req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const link = sql.get('SELECT * FROM share_links WHERE token_hash = ?', tokenHash(req.params.token));
    const live = link && !link.revoked_at && (!link.expires_at || link.expires_at > Date.now()) && sharingPolicy.get().shareLinks;
    const view = live && publicShare(link);
    if (!view) throw new HttpError(404, 'This link has expired or was turned off.');
    sql.run('UPDATE share_links SET views = views + 1, last_viewed_at = ? WHERE id = ?', Date.now(), link.id);
    return view;
  }),
);

export default router;
