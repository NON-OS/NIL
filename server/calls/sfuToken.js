import crypto from 'node:crypto';
import config from '../config.js';

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const keyed = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('base64url').slice(0, 22);

// A LiveKit access token (a JWT, HS256 under the SFU's API secret) for one person's tab in one
// call. The room and the person go by keyed hashes, so the SFU never learns a call id or who
// anyone is, and the name changes with every call and every tab. Only joining, publishing and
// receiving media are allowed: no data messages, no metadata, nothing the SFU would store.
// `admin` makes the token the server itself uses to remove someone from the room.
export default function sfuToken({ callId, userId = null, session = null, admin = false, now = Date.now() }) {
  const { key, secret, url } = config.calls.sfu;
  const room = keyed(secret, `nil/sfu-room/v1\n${callId}`);
  const identity = userId ? keyed(secret, `nil/sfu-identity/v1\n${callId}\n${userId}\n${session}`) : null;
  const seconds = Math.floor(now / 1000);
  const grant = admin ? { room, roomAdmin: true } : { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false };
  const payload = { iss: key, nbf: seconds - 10, exp: seconds + config.calls.turnTtlSeconds, video: grant, ...(identity ? { sub: identity } : {}) };
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  const token = `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  return { url, token, room, identity };
}
