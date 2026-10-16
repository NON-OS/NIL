import config from '../config.js';

// __Host- cookies can't be set by subdomains or over plain http, so we use it whenever we can.
const SECURE_NAME = '__Host-nonos';
const PLAIN_NAME = 'nonos';

function parse(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Whether the browser reached us over HTTPS, for plain requests and WebSocket upgrades alike.
// X-Forwarded-Proto counts even without TRUST_PROXY because it can only make the server
// stricter: a request claiming https gets the __Host- cookie and loses the plain one, and
// nobody can add that header to someone else's browser requests.
function overHttps(req) {
  if (req.secure || req.socket?.encrypted) return true;
  return String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase() === 'https';
}

const sessionCookie = {
  // Over HTTPS only the __Host- cookie counts. A sibling subdomain can plant a plain cookie for
  // this domain, and reading it would sign the browser in as whoever planted it.
  read(req) {
    const cookies = parse(req.headers.cookie);
    return (overHttps(req) ? cookies[SECURE_NAME] : cookies[PLAIN_NAME]) || null;
  },

  write(req, res, token) {
    const maxAge = config.sessionDays * 86_400;
    const cookie = overHttps(req)
      ? `${SECURE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
      : `${PLAIN_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
    res.setHeader('Set-Cookie', cookie);
  },

  clear(req, res) {
    res.setHeader('Set-Cookie', [
      `${SECURE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${PLAIN_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    ]);
  },
};

export default sessionCookie;
