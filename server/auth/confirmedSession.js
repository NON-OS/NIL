import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import sessionCookie from './sessionCookie.js';
import tokenHash from './tokenHash.js';

// Linking another wallet and making an access key both outlast the session they're made in, so
// a session alone isn't enough: one of the person's linked wallets must have signed a confirm
// message in this session within the last few minutes (config.signIn.confirmMs).
export default function confirmedSession(req, now = Date.now()) {
  const token = sessionCookie.read(req);
  const row = token && sql.get('SELECT confirmed_at FROM sessions WHERE token_hash = ?', tokenHash(token));
  if (!row?.confirmed_at || row.confirmed_at < now - config.signIn.confirmMs) {
    throw HttpError.forbidden('Confirm it’s you first: sign with a wallet that’s already linked to your account.');
  }
}
