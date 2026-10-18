import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import parseOneTime from '../stealth/parseOneTime.js';
import payeeMeta from './payeeMeta.js';

const WITHOUT = {
  'no-wallet': 'That person has no wallet linked.',
  off: 'That person hasn’t turned on private payouts.',
  none: 'That person hasn’t turned on private payouts, and their wallet has no stealth meta-address in the public registry.',
  invalid: 'That person hasn’t turned on private payouts, and what their wallet has in the public stealth registry isn’t a valid meta-address.',
};

// Where a private payout goes, from what the payer's browser sent. Only people with a
// meta-address, in Nil or in the registry, can be paid this way. The server can't tell a
// one-time address from any other, so it refuses what it can see is wrong: an address or
// ephemeral key used before, which would link two payouts, and a wallet someone signs in with.
export default async function privateTarget(payee, stealth) {
  const { metaAddress, problem } = await payeeMeta(payee);
  if (!metaAddress) throw HttpError.badRequest(WITHOUT[problem]);
  const one = parseOneTime(stealth);
  // payments as well as intents: the purge erases an expired intent once a payment carries its address
  const seen = 'stealth_ephemeral IS NOT NULL AND (stealth_ephemeral = ? OR to_address = ?)';
  if (sql.get(`SELECT 1 FROM payment_intents WHERE ${seen} UNION ALL SELECT 1 FROM payments WHERE ${seen}`, one.ephemeralPublicKey, one.address, one.ephemeralPublicKey, one.address)) {
    throw HttpError.badRequest('That one-time address was already used for another payout. Pay again for a fresh one.');
  }
  if (sql.get("SELECT 1 FROM credentials WHERE kind = 'wallet' AND lower(external_id) = ?", one.address)) throw HttpError.badRequest('That’s a sign-in wallet, not a one-time address.');
  return { to: one.address, ephemeral: one.ephemeralPublicKey, viewTag: one.viewTag };
}
