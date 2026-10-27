import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import sql from '../db/sql.js';

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

// Whether a statement a browser signed (see signedFacts in the web app) carries its signer's
// Ed25519 signature over its kind, place, facts and text, by the signing key they published.
// Browsers check again against the keys they confirmed, which is what counts; this keeps a member
// from filing something no browser would accept, which would stall a conversation for everyone.
export default function factsSigned(value, { kind, place }) {
  const key = sql.get('SELECT signing_key FROM encryption_keys WHERE user_id = ?', value.by)?.signing_key;
  if (!key || typeof value.sig !== 'string' || !SIGNATURE.test(value.sig)) return false;
  const message = `nil/signed/v1\n${kind}\n${JSON.stringify([...place, ...value.facts])}\n${value.by}\n${value.text}`;
  try {
    return ed25519.verify(Buffer.from(value.sig, 'base64url'), utf8ToBytes(message), Buffer.from(key, 'base64url'));
  } catch {
    return false;
  }
}
