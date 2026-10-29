import crypto from 'node:crypto';
import config from '../config.js';

// Relay passwords in the form coturn checks with use-auth-secret (the "TURN REST API"): the
// username is the moment they stop working and a name for the person, the password is
// HMAC-SHA1 of the username under the secret this server shares with coturn. coturn needs no
// list of users and nothing to look up, and a password is useless after its time.
//
// The name is a keyed hash of the person and the call, never either id, so coturn's per-user
// quota holds within a call without coturn, its logs or anyone watching port 3478 learning who
// anyone is or tying one call to the next.
export default function turnCredentials(userId, callId, now = Date.now()) {
  const { secret, urls } = config.calls.turn;
  const ttl = config.calls.turnTtlSeconds;
  const expiresAt = Math.floor(now / 1000) + ttl;
  const name = crypto.createHmac('sha256', secret).update(`nil/turn-user/v2\n${userId}\n${callId}`).digest('base64url').slice(0, 16);
  const username = `${expiresAt}:${name}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { urls, username, credential, expiresAt: expiresAt * 1000, ttlSeconds: ttl };
}
