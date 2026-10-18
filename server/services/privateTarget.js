import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import parseOneTime from '../stealth/parseOneTime.js';

// Where a private payout goes, from what the payer's browser sent. Only people who published a
// meta-address can be paid this way. The server can't tell a one-time address from any other,
// so it refuses what it can see is wrong: an address or ephemeral key used before, which would
// link two payouts, and a wallet someone signs in with.
export default function privateTarget(payee, stealth) {
  if (!payee.stealth_meta) throw HttpError.badRequest('That person hasn’t turned on private payouts.');
  const one = parseOneTime(stealth);
  if (sql.get('SELECT 1 FROM payment_intents WHERE stealth_ephemeral IS NOT NULL AND (stealth_ephemeral = ? OR to_address = ?)', one.ephemeralPublicKey, one.address)) {
    throw HttpError.badRequest('That one-time address was already used for another payout. Pay again for a fresh one.');
  }
  if (sql.get("SELECT 1 FROM credentials WHERE kind = 'wallet' AND lower(external_id) = ?", one.address)) throw HttpError.badRequest('That’s a sign-in wallet, not a one-time address.');
  return { to: one.address, ephemeral: one.ephemeralPublicKey, viewTag: one.viewTag };
}
