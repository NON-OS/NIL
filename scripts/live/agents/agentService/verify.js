import crypto from 'node:crypto';

// The receiver check from docs/ai-agents.md, unchanged: HMAC-SHA256 of "<t>.<raw body>" with the
// signing secret, compared in constant time, and a timestamp no older than the tolerance.
export default function verify(secret, header, rawBody, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  const given = Buffer.from(parts.v1 ?? '');
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
