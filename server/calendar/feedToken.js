import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

const KEY_DIR = path.join(config.dataDir, 'keys');
const KEY_FILE = path.join(KEY_DIR, 'calendar-feeds.key');
const ID_BYTES = 16;
const MAC_BYTES = 16;
let key;

// Kept beside the database, not in it: a copy of the database alone can't rebuild feed links.
function secret() {
  if (key) return key;
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(KEY_FILE)) fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
  key = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64url');
  return key;
}

const mac = (id) => crypto.createHmac('sha256', secret()).update(id).digest().subarray(0, MAC_BYTES);

// The secret part of a calendar feed link: the feed's id and a MAC over it, in one opaque string.
// The server can show the link again whenever it's asked, yet stores only the id.
const feedToken = {
  newId: () => crypto.randomBytes(ID_BYTES).toString('base64url'),

  make: (id) => Buffer.concat([Buffer.from(id, 'base64url'), mac(Buffer.from(id, 'base64url'))]).toString('base64url'),

  // The feed id inside a token, or null when the token wasn't made here.
  read(token) {
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null;
    const raw = Buffer.from(token, 'base64url');
    const id = raw.subarray(0, ID_BYTES);
    return crypto.timingSafeEqual(raw.subarray(ID_BYTES), mac(id)) ? id.toString('base64url') : null;
  },
};

export default feedToken;
