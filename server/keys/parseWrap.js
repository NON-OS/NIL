import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import siwe from '../auth/siwe.js';

// The identity seed (32 bytes) under AES-256-GCM: a 12-byte IV, the seed and a 16-byte tag,
// 60 bytes or 80 characters of base64url.
const WRAPPED = 80;
const NONCE = /^[A-Za-z0-9]{8,64}$/;
const ISSUED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// A member's identity wrapped for one of their wallets. The key behind the wrap comes from that
// wallet signing a message built from the nonce and date stored here, so the server can't open
// it; all it can check is the shape and that the wallet belongs to the member.
export default function parseWrap(value, userId) {
  if (!value || typeof value !== 'object' || !siwe.isAddress(value.address)) throw HttpError.badRequest('That key wrap isn’t in a shape Nil understands.');
  const address = value.address.toLowerCase();
  if (typeof value.nonce !== 'string' || !NONCE.test(value.nonce)) throw HttpError.badRequest('That key wrap has a malformed nonce.');
  if (typeof value.issuedAt !== 'string' || !ISSUED.test(value.issuedAt) || Number.isNaN(Date.parse(value.issuedAt))) throw HttpError.badRequest('That key wrap has a malformed date.');
  if (!sql.get("SELECT 1 FROM credentials WHERE user_id = ? AND kind = 'wallet' AND external_id = ?", userId, address)) throw HttpError.forbidden('That wallet isn’t linked to your account.');
  return { address, nonce: value.nonce, issuedAt: value.issuedAt, wrapped: cipherText(value.wrapped, 'Key wrap', { exact: WRAPPED }) };
}
