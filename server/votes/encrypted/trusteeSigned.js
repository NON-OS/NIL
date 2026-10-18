import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import sql from '../../db/sql.js';

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

// Whether `signature` (base64url) is the trustee's Ed25519 signature over `text`, by the signing
// key they published. Browsers check again against the keys they pinned, which is what counts;
// this only keeps a broken or mistaken dealing from stalling a vote that could never open.
export default function trusteeSigned(userId, text, signature) {
  const key = sql.get('SELECT signing_key FROM encryption_keys WHERE user_id = ?', userId)?.signing_key;
  if (!key || typeof signature !== 'string' || !SIGNATURE.test(signature)) return false;
  try {
    return ed25519.verify(Buffer.from(signature, 'base64url'), utf8ToBytes(text), Buffer.from(key, 'base64url'));
  } catch {
    return false;
  }
}
