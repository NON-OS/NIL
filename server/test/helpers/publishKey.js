import crypto from 'node:crypto';
import keyStatement from '../../keys/keyStatement.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// Publishes encryption keys the way a browser does: two public keys (random stand-ins, since
// the server can't tell), a statement signed by the member's wallet for this site, workspace
// and account, and the identity wrapped for that wallet. Options let a test break any part.
export default async function publishKey(call, w, options = {}) {
  const { origin, workspaceKey, me } = (await call('GET', '/api/bootstrap')).data;
  const { reset = false, publicKey = blob(32), signingKey = blob(32), createdAt = Date.now(), userId = me.id, sign = w.sign, wrap = true } = options;
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
  return { ...res, sent: body, message };
}
