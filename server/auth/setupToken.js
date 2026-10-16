import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import sql from '../db/sql.js';
import log from '../lib/log.js';
import HttpError from '../lib/HttpError.js';

// Whoever creates the first workspace, or restores a capsule into an empty server, owns it.
// Without this token anyone who reached a fresh server before its operator could claim it.
const FILE = path.join(config.dataDir, 'setup-token');

const claimed = () => Boolean(sql.get('SELECT 1 FROM users LIMIT 1'));

function stored() {
  try {
    return fs.readFileSync(FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

// comparing digests keeps the comparison constant-time whatever the lengths
const digest = (value) => crypto.createHash('sha256').update(value).digest();

const setupToken = {
  // At startup. A generated token is printed once, when it's made, and kept in the data folder
  // so a restart doesn't invalidate one the operator already copied.
  prepare() {
    if (claimed()) return setupToken.discard();
    if (config.setupToken) return log.info('setup', 'No workspace yet. Enter the SETUP_TOKEN from your settings on the setup screen to claim this server.');
    if (stored()) return log.info('setup', `No workspace yet. The setup token was printed when this server first started, and is kept in ${FILE}.`);
    const token = crypto.randomBytes(24).toString('base64url');
    fs.writeFileSync(FILE, `${token}\n`, { mode: 0o600, flag: 'wx' });
    log.info('setup', `No workspace yet. To claim this server, open it and enter this one-time setup token: ${token}`);
  },

  check(value) {
    const expected = config.setupToken ?? stored();
    const given = typeof value === 'string' ? value.trim() : '';
    if (!expected || !given || !crypto.timingSafeEqual(digest(given), digest(expected))) {
      throw HttpError.forbidden('That setup token isn’t right. It’s printed in the server log from the first start (or set as SETUP_TOKEN).');
    }
  },

  // Once a workspace exists the token has nothing left to protect.
  discard() {
    fs.rmSync(FILE, { force: true });
  },
};

export default setupToken;
