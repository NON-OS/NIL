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

const sessionCookie = {
  read(req) {
    const cookies = parse(req.headers.cookie);
    return cookies[SECURE_NAME] || cookies[PLAIN_NAME] || null;
  },

  write(req, res, token) {
    const maxAge = config.sessionDays * 86_400;
    const cookie = req.secure
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
