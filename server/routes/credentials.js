import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import signInAudit from '../services/signInAudit.js';
import hasWayBack from '../keys/hasWayBack.js';

const router = express.Router();

function overview(userId) {
  const user = sql.get('SELECT share_wallet FROM users WHERE id = ?', userId);
  return {
    shareWallet: Boolean(user.share_wallet),
    credentials: sql.all('SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at', userId).map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      address: c.kind === 'wallet' ? c.external_id : null,
      createdAt: c.created_at,
      lastUsedAt: c.last_used_at,
    })),
  };
}

router.get('/me/credentials', route((req) => overview(req.user.id)));

router.patch(
  '/me/credentials/:id',
  route((req) => {
    sql.run('UPDATE credentials SET label = ? WHERE id = ? AND user_id = ?', check.text(req.body.label, 'Name', { min: 1, max: 60 }), req.params.id, req.user.id);
    return overview(req.user.id);
  }),
);

// Nobody can remove their last wallet, since it's their only way back in. Nor the last wallet
// that holds their encryption keys while passkeys do, unless they saved a recovery kit: a passkey
// is tied to this site's address and must never be the only way back to their keys.
router.delete(
  '/me/credentials/:id',
  route((req) => {
    const current = overview(req.user.id);
    const credential = current.credentials.find((c) => c.id === req.params.id);
    if (!credential) throw HttpError.notFound('That sign-in method');
    if (current.credentials.length < 2) throw HttpError.badRequest('This is your only wallet. Link another one before removing it.');
    if (sql.get('SELECT 1 FROM passkey_wraps WHERE user_id = ?', req.user.id) && !hasWayBack(req.user.id, { without: credential.address })) {
      throw new HttpError(409, 'Your passkeys would be the only way back to your encryption keys. Add another wallet to your keys or download a recovery kit first.');
    }
    sql.run('DELETE FROM credentials WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    signInAudit('wallet.removed', { actorId: req.user.id, subjectId: req.user.id });
    return overview(req.user.id);
  }),
);

router.patch(
  '/me/privacy',
  route((req) => {
    if ('shareWallet' in req.body) sql.run('UPDATE users SET share_wallet = ? WHERE id = ?', req.body.shareWallet ? 1 : 0, req.user.id);
    return overview(req.user.id);
  }),
);

export default router;
