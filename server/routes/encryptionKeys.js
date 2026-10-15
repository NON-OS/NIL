import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import hub from '../realtime/hub.js';

const router = express.Router();

// Public encryption keys, so browsers can seal doc keys for teammates. A 32-byte X25519 key
// is 43 characters of base64url.
router.get(
  '/encryption-keys',
  route(() => sql.all('SELECT k.user_id, k.public_key FROM encryption_keys k JOIN users u ON u.id = k.user_id WHERE u.deactivated = 0').map((r) => ({ userId: r.user_id, publicKey: r.public_key }))),
);

// Your key comes from your wallet, so it only changes if you switch to a wallet that isn't
// linked to the old key. Resetting gives up every doc sealed to the old key.
router.put(
  '/me/encryption-key',
  route((req) => {
    const publicKey = cipherText(req.body?.publicKey, 'Public key', { exact: 43 });
    const current = sql.get('SELECT public_key FROM encryption_keys WHERE user_id = ?', req.user.id);
    if (current?.public_key === publicKey) return { publicKey };
    if (current && req.body?.reset !== true) throw new HttpError(409, 'You already have a different encryption key. Unlock with the wallet you used before, or reset (you’ll lose access to docs until someone shares them again).');
    sql.tx(() => {
      if (current) sql.run('DELETE FROM doc_keys WHERE user_id = ?', req.user.id);
      sql.run('INSERT INTO encryption_keys (user_id, public_key, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET public_key = excluded.public_key, created_at = excluded.created_at', req.user.id, publicKey, Date.now());
    });
    // online teammates' browsers react by sealing team docs for the newcomer
    hub.broadcast({ type: 'docs', id: null });
    return { publicKey };
  }),
);

export default router;
