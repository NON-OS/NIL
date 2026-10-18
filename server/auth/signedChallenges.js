import crypto from 'node:crypto';

// A challenge carries its whole message and data; anything longer was never one of ours.
const MAX_TOKEN = 16 * 1024;

// Single-use, short-lived challenges that live in the token the client holds rather than in a
// table on the server, so nobody can push other people's out by asking for many. The token is
// the challenge's data, purpose and expiry, signed with a key that only exists in this process,
// together with the client it was given to: it can only be used from the network that asked for
// it. Each one works once; its id is remembered only until it would have expired anyway.
export default function signedChallenges({ ttlMs }) {
  const key = crypto.randomBytes(32);
  const used = new Map();
  const sign = (body, client) => crypto.createHmac('sha256', key).update(`${body}\n${client}`).digest('base64url');

  // every challenge lives equally long, so the ones that ran out are always at the front
  function prune(now) {
    for (const [id, expires] of used) {
      if (expires >= now) break;
      used.delete(id);
    }
  }

  return {
    issue(purpose, data, client) {
      const body = Buffer.from(JSON.stringify({ id: crypto.randomBytes(16).toString('base64url'), purpose, expires: Date.now() + ttlMs, data })).toString('base64url');
      return `${body}.${sign(body, client)}`;
    },

    take(token, purpose, client) {
      if (typeof token !== 'string' || token.length > MAX_TOKEN) return null;
      const [body, mac, extra] = token.split('.');
      if (!body || !mac || extra !== undefined) return null;
      const expected = Buffer.from(sign(body, client));
      const given = Buffer.from(mac);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
      const now = Date.now();
      prune(now);
      const challenge = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (challenge.purpose !== purpose || challenge.expires < now || used.has(challenge.id)) return null;
      used.set(challenge.id, challenge.expires);
      return challenge.data;
    },

    get used() {
      return used.size;
    },
  };
}
