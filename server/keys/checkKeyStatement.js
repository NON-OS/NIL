import sql from '../db/sql.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import siwe from '../auth/siwe.js';
import relyingParty from '../auth/relyingParty.js';
import signingKey from '../proofs/signingKey.js';
import keyStatement from './keyStatement.js';

// A statement must be signed just now, so one lifted from an old backup or a browser history
// can't be replayed to roll someone back to a key they gave up.
const FRESH_MS = 10 * 60_000;

// Checks a key publication from the browser: well-formed keys, a fresh date, and a signature
// over the exact statement for this site, this workspace and this account, made by one of the
// account's own linked wallets. A session cookie alone can't publish anything.
export default function checkKeyStatement(req, body) {
  const publicKey = cipherText(body?.publicKey, 'Encryption key', { exact: 43 });
  const signing = cipherText(body?.signingKey, 'Signing key', { exact: 43 });
  const createdAt = check.number(body?.createdAt, 'Key date', { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true });
  if (createdAt === null || Math.abs(Date.now() - createdAt) > FRESH_MS) throw HttpError.badRequest('That key signature is stale. Sign it again.');
  if (!siwe.isAddress(body?.address)) throw HttpError.badRequest('That doesn’t look like an Ethereum address.');
  const address = body.address.toLowerCase();
  const rp = relyingParty(req);
  const message = keyStatement({ host: rp.host, origin: rp.origin, address, workspaceKey: signingKey.publicKey(), userId: req.user.id, publicKey, signingKey: signing, createdAt });
  if (siwe.recover(message, body.signature) !== address) throw HttpError.badRequest('That signature doesn’t match the keys and the wallet.');
  if (!sql.get("SELECT 1 FROM credentials WHERE user_id = ? AND kind = 'wallet' AND external_id = ?", req.user.id, address)) {
    throw HttpError.forbidden('Sign with a wallet linked to your account.');
  }
  return { publicKey, signingKey: signing, createdAt, address, signature: body.signature };
}
