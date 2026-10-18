import crypto from 'node:crypto';

// Wallet challenges carry their own state, sealed with a key that exists only in this process,
// so the server keeps no list of open challenges for a flood to fill and nobody's challenge can
// be pushed out by someone else's. A restart only means visitors who were halfway start again.
export default function challengeToken(key = crypto.randomBytes(32)) {
  const tag = (body) => crypto.createHmac('sha256', key).update(body).digest('base64url');
  return {
    issue: (fields) => {
      const body = Buffer.from(JSON.stringify(fields)).toString('base64url');
      return `${body}.${tag(body)}`;
    },

    // The fields, or null for anything this process didn't issue.
    open(token) {
      if (typeof token !== 'string' || token.length > 2048) return null;
      const [body, mac, extra] = token.split('.');
      if (!body || !mac || extra !== undefined) return null;
      const expected = Buffer.from(tag(body));
      const given = Buffer.from(mac);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
      try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
    },
  };
}
