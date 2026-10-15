import crypto from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

function derive(password, salt, params, length) {
  return crypto.scryptSync(String(password).normalize('NFKC'), salt, length, { ...params, maxmem: 64 * 1024 * 1024 });
}

// Used when the email doesn't exist so a failed login takes the same time either way.
const DUMMY = (() => {
  const salt = crypto.randomBytes(16);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derive('dummy', salt, PARAMS, KEY_LENGTH).toString('base64')}`;
})();

const password = {
  hash(plain) {
    const salt = crypto.randomBytes(16);
    const key = derive(plain, salt, PARAMS, KEY_LENGTH);
    return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
  },

  verify(plain, stored = DUMMY) {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, N, r, p, salt, key] = parts;
    const expected = Buffer.from(key, 'base64');
    const actual = derive(plain, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) }, expected.length);
    return crypto.timingSafeEqual(expected, actual) && stored !== DUMMY;
  },
};

export default password;
