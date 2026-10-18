import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import parsePasskey from '../keys/parsePasskey.js';
import passkeyList from '../keys/passkeyList.js';
import hasWayBack from '../keys/hasWayBack.js';

const MAX_PASSKEYS = 10;
const router = express.Router();

// Each route acts on the caller's own passkeys only; anyone else's id is simply not found.
const own = (req) => {
  const row = sql.get('SELECT id FROM passkey_wraps WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!row) throw HttpError.notFound('That passkey');
  return row.id;
};

// Adds a passkey wrap of your identity. The browser makes it while your keys are unlocked and
// checks that the passkey opens it again before sending it. A passkey is never your only way back
// to your keys, so a wallet must hold them too or you must have saved a recovery kit.
router.post(
  '/me/passkeys',
  route((req) => {
    const passkey = parsePasskey(req.body);
    if (!sql.get('SELECT 1 FROM encryption_keys WHERE user_id = ?', req.user.id)) throw new HttpError(409, 'Publish your encryption keys first.');
    if (!hasWayBack(req.user.id)) throw new HttpError(409, 'Add a wallet to your keys or download a recovery kit first, so a passkey is never your only way back.');
    if (sql.get('SELECT 1 FROM passkey_wraps WHERE user_id = ? AND credential_id = ?', req.user.id, passkey.credentialId)) throw new HttpError(409, 'That passkey already unlocks your keys.');
    if (sql.get('SELECT COUNT(*) AS n FROM passkey_wraps WHERE user_id = ?', req.user.id).n >= MAX_PASSKEYS) throw new HttpError(409, `You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.`);
    sql.run(
      'INSERT INTO passkey_wraps (id, user_id, credential_id, salt, wrapped, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId(), req.user.id, passkey.credentialId, passkey.salt, passkey.wrapped, passkey.label, Date.now(),
    );
    return { passkeys: passkeyList(req.user.id) };
  }),
);

router.patch(
  '/me/passkeys/:id',
  route((req) => {
    sql.run('UPDATE passkey_wraps SET label = ? WHERE id = ?', check.text(req.body.label, 'Name', { min: 1, max: 60 }), own(req));
    return { passkeys: passkeyList(req.user.id) };
  }),
);

router.delete(
  '/me/passkeys/:id',
  route((req) => {
    sql.run('DELETE FROM passkey_wraps WHERE id = ?', own(req));
    return { passkeys: passkeyList(req.user.id) };
  }),
);

// The browser says when a passkey opened your keys, so Settings can show when each was last used.
router.post(
  '/me/passkeys/:id/used',
  route((req) => {
    sql.run('UPDATE passkey_wraps SET last_used_at = ? WHERE id = ?', Date.now(), own(req));
    return { passkeys: passkeyList(req.user.id) };
  }),
);

export default router;
