import crypto from 'node:crypto';

// The Nil-Signature header: HMAC-SHA256 over "<unix seconds>.<raw body>" with the agent's secret,
// as "t=<seconds>,v1=<hex>". Receivers recompute it over the exact bytes they got and reject a
// timestamp outside their replay window.
export default function signPayload(secret, timestamp, body) {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}
