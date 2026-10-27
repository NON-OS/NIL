import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import keyStatement from '../../keys/keyStatement.js';
import signers from './signers.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// Publishes encryption keys the way a browser does: an encryption key (a random stand-in, since
// the server can't tell), a real Ed25519 signing key, a statement signed by the member's wallet
// for this site, workspace and account, and the identity wrapped for that wallet. Options let a
// test break any part. The signing key's private half is kept on the client as `signer`, for
// tests that sign as this member the way their browser would (trustee dealings, say).
export default async function publishKey(call, w, options = {}) {
  const { origin, workspaceKey, me } = (await call('GET', '/api/bootstrap')).data;
  const signingPrivate = ed25519.utils.randomPrivateKey();
  const { reset = false, publicKey = blob(32), signingKey = Buffer.from(ed25519.getPublicKey(signingPrivate)).toString('base64url'), createdAt = Date.now(), userId = me.id, sign = w.sign, wrap = true } = options;
  const url = new URL(options.origin ?? origin);
  const message = keyStatement({ host: url.host, origin: url.origin, address: w.address, workspaceKey: options.workspaceKey ?? workspaceKey, userId, publicKey, signingKey, createdAt });
  const body = {
    publicKey,
    signingKey,
    createdAt,
    address: w.address,
    signature: sign(message),
    reset,
    ...(wrap ? { wrap: { address: w.address, nonce: blob(6).replace(/[-_]/g, 'x'), issuedAt: new Date(createdAt).toISOString(), wrapped: blob(60) } } : {}),
  };
  const res = await call('PUT', '/api/me/encryption-key', body);
  if (res.status === 200 && !options.signingKey) {
    call.signer = { userId, signingPrivate };
    signers.set(userId, { signingPrivate, workspaceKey });
  }
  return { ...res, sent: body, message };
}
