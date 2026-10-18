import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import parseWrap from '../keys/parseWrap.js';

const router = express.Router();

// Your identity, wrapped once for each linked wallet. Only your own wraps ever leave the server,
// and none of them opens without a signature from its wallet. Removing a wallet removes its wrap.
router.get(
  '/me/identity-wraps',
  route((req) => ({
    wraps: sql.all('SELECT address, nonce, issued_at, wrapped FROM identity_wraps WHERE user_id = ? ORDER BY created_at', req.user.id).map((w) => ({ address: w.address, nonce: w.nonce, issuedAt: w.issued_at, wrapped: w.wrapped })),
  })),
);

// Adds or replaces the wrap for one more of your wallets. The browser makes it while your
// identity is unlocked, after checking it opens again with that wallet's signature.
router.put(
  '/me/identity-wraps',
  route((req) => {
    if (!sql.get('SELECT 1 FROM encryption_keys WHERE user_id = ?', req.user.id)) throw new HttpError(409, 'Publish your encryption keys first.');
    const wrap = parseWrap(req.body, req.user.id);
    sql.run('INSERT OR REPLACE INTO identity_wraps (user_id, address, nonce, issued_at, wrapped, created_at) VALUES (?, ?, ?, ?, ?, ?)', req.user.id, wrap.address, wrap.nonce, wrap.issuedAt, wrap.wrapped, Date.now());
    return { ok: true };
  }),
);

// Notes that you downloaded a recovery kit for the keys you have now. The kit itself never comes
// here. The note lets a passkey be one more way back to your keys rather than the only one, and a
// key reset clears it, since the old kit holds the old keys.
router.put(
  '/me/recovery-kit',
  route((req) => {
    if (typeof req.body?.publicKey !== 'string') throw HttpError.badRequest('Say which keys the kit holds.');
    const savedAt = Date.now();
    const { changes } = sql.run('UPDATE encryption_keys SET kit_saved_at = ? WHERE user_id = ? AND public_key = ?', savedAt, req.user.id, req.body.publicKey);
    if (!changes) throw new HttpError(409, 'Your keys changed since this kit was made. Unlock again and download a new one.');
    return { savedAt };
  }),
);

export default router;
