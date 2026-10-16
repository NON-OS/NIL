import crypto from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

// The token that tells a push service which server is sending (RFC 8292): an ES256 JWT for one
// push service origin. Push services refuse an expiry more than 24 hours out.
export default function vapidJwt({ audience, subject = null, expiresAt, privateKey }) {
  const claims = { aud: audience, exp: Math.floor(expiresAt / 1000), ...(subject ? { sub: subject } : {}) };
  const input = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`;
  // JWS wants the raw 64-byte r||s signature, not DER
  const signature = crypto.sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${signature.toString('base64url')}`;
}
