import config from '../config.js';
import vapidKeys from './vapidKeys.js';
import vapidJwt from './vapidJwt.js';
import encryptPayload from './encryptPayload.js';
import pushEndpoint from './pushEndpoint.js';

const HOUR = 3_600_000;
// A push service that doesn't answer in this long is treated as down for this message.
const TIMEOUT_MS = 10_000;
// Every message is padded to a multiple of this many bytes, so its size says nothing about it.
const PAD_BLOCK = 1024;

const tokens = new Map();

// One token per push service, reused until an hour before it expires.
function authorization(audience) {
  const now = Date.now();
  let entry = tokens.get(audience);
  if (!entry || entry.renewAt < now) {
    const expiresAt = now + 12 * HOUR;
    entry = { token: vapidJwt({ audience, subject: config.push.subject, expiresAt, privateKey: vapidKeys.privateKey() }), renewAt: expiresAt - HOUR };
    tokens.set(audience, entry);
  }
  return `vapid t=${entry.token}, k=${vapidKeys.publicKey()}`;
}

// Delivers one encrypted message to one browser subscription. Says 'sent', 'gone' (the
// subscription will never work again and should be dropped) or 'failed' (try another time).
// `ttlSeconds` is how long the push service keeps trying a device that's away; a call's ring
// is worth nothing once it stops.
export default async function sendPush(subscription, message, { urgency = 'normal', ttlSeconds = config.push.ttlHours * 3600 } = {}) {
  const url = pushEndpoint(subscription.endpoint);
  if (!url) return 'gone';
  const text = JSON.stringify(message);
  const padTo = Math.ceil((Buffer.byteLength(text) + 1) / PAD_BLOCK) * PAD_BLOCK;
  let body;
  try {
    body = encryptPayload(text, subscription, { padTo });
  } catch {
    return 'gone';
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      // a push service never redirects; following one could lead anywhere
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: authorization(url.origin),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: urgency,
      },
      body,
    });
  } catch {
    return 'failed';
  }
  await res.body?.cancel().catch(() => {});
  if (res.ok) return 'sent';
  // 404 and 410 mean the browser unsubscribed. 401 and 403 mean the subscription was made for
  // another server key, so it can't work with this one; the browser subscribes again next time.
  if ([401, 403, 404, 410].includes(res.status)) return 'gone';
  return 'failed';
}
