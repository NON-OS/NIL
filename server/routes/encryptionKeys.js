import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import checkKeyStatement from '../keys/checkKeyStatement.js';
import parseWrap from '../keys/parseWrap.js';
import dropTaskKeys from '../keys/dropTaskKeys.js';
import publishTask from '../services/publishTask.js';
import publishUser from '../services/publishUser.js';
import toEncryptionKey from '../mappers/toEncryptionKey.js';
import eraseOrphans from '../chat/eraseOrphans.js';

const router = express.Router();

// Every member's published keys, each with the wallet signature behind it. A key whose signing
// wallet has since been unlinked from its owner is left out until they sign it again.
router.get(
  '/encryption-keys',
  route(() =>
    sql
      .all(
        `SELECT k.*, u.deactivated FROM encryption_keys k JOIN users u ON u.id = k.user_id
         WHERE EXISTS (SELECT 1 FROM credentials c WHERE c.user_id = k.user_id AND c.kind = 'wallet' AND c.external_id = k.address)`,
      )
      .map(toEncryptionKey),
  ),
);

// Keys people replaced, each with its wallet signature, for checking what they signed before.
// Browsers rebuild and check each statement themselves, and take a key as good only for what
// was signed before the next one, whose time its own statement signs.
router.get(
  '/encryption-keys/earlier',
  route(() =>
    sql
      .all('SELECT h.*, u.deactivated FROM encryption_key_history h JOIN users u ON u.id = h.user_id ORDER BY h.user_id, h.created_at')
      .map(toEncryptionKey),
  ),
);

// Publishing your keys always takes a fresh signature from one of your wallets. Signing the same
// keys again (after removing the wallet that signed them, say) changes nothing else. New keys
// need `reset`: that gives up every doc and private task sealed to the old ones, every wallet and
// passkey wrap of them and the note of a recovery kit, and turns private payouts off, since new
// payouts to the old payout keys couldn't be opened. Teammates' browsers flag the change until
// each of them confirms it.
router.put(
  '/me/encryption-key',
  route((req) => {
    const next = checkKeyStatement(req, req.body);
    const current = sql.get('SELECT public_key, signing_key, address, signature, created_at FROM encryption_keys WHERE user_id = ?', req.user.id);
    const same = Boolean(current) && current.public_key === next.publicKey && current.signing_key === next.signingKey;
    if (current && !same && req.body?.reset !== true) {
      throw new HttpError(409, 'You already have different encryption keys. Unlock with a wallet that opens them, restore your recovery kit, or reset (you’ll lose access to encrypted docs and private tasks until someone shares them again).');
    }
    if (current && next.createdAt <= current.created_at) throw new HttpError(409, 'A newer signature for your keys is already published.');
    const wrap = req.body?.wrap ? parseWrap(req.body.wrap, req.user.id) : null;
    if (!same && !wrap) throw HttpError.badRequest('Send your keys wrapped for this wallet too, or no wallet could unlock them.');

    let dropped = [];
    sql.tx(() => {
      if (current && !same) {
        // the old key stays checkable for what was signed with it, by its wallet signature
        sql.run(
          'INSERT OR IGNORE INTO encryption_key_history (user_id, public_key, signing_key, address, signature, created_at, replaced_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          req.user.id, current.public_key, current.signing_key, current.address, current.signature, current.created_at, next.createdAt,
        );
        sql.run('DELETE FROM doc_keys WHERE user_id = ?', req.user.id);
        sql.run('DELETE FROM chat_epoch_keys WHERE user_id = ?', req.user.id);
        sql.run('DELETE FROM chat_history_keys WHERE user_id = ?', req.user.id);
        sql.run('DELETE FROM identity_wraps WHERE user_id = ?', req.user.id);
        sql.run('DELETE FROM passkey_wraps WHERE user_id = ?', req.user.id);
        sql.run('UPDATE encryption_keys SET kit_saved_at = NULL WHERE user_id = ?', req.user.id);
        sql.run('UPDATE users SET stealth_meta = NULL WHERE id = ?', req.user.id);
        dropped = dropTaskKeys(req.user.id);
        // a conversation whose key only the old keys held can't go on
        eraseOrphans();
      }
      sql.run(
        `INSERT INTO encryption_keys (user_id, public_key, signing_key, address, signature, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET public_key = excluded.public_key, signing_key = excluded.signing_key, address = excluded.address, signature = excluded.signature, created_at = excluded.created_at`,
        req.user.id, next.publicKey, next.signingKey, next.address, next.signature, next.createdAt,
      );
      if (wrap) {
        sql.run(
          'INSERT OR REPLACE INTO identity_wraps (user_id, address, nonce, issued_at, wrapped, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          req.user.id, wrap.address, wrap.nonce, wrap.issuedAt, wrap.wrapped, Date.now(),
        );
      }
    });
    for (const id of dropped) publishTask(id);
    if (current && !same) publishUser(req.user.id);
    hub.broadcast({ type: 'keys' });
    // online teammates' browsers react by sealing team docs for a newcomer they've confirmed
    if (!same) hub.broadcast({ type: 'docs', id: null });
    return toEncryptionKey({ user_id: req.user.id, public_key: next.publicKey, signing_key: next.signingKey, address: next.address, signature: next.signature, created_at: next.createdAt, deactivated: 0 });
  }),
);

export default router;
