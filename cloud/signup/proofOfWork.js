import crypto from 'node:crypto';

function leadingZeroBits(digest) {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

// A small hashcash puzzle instead of a third-party captcha: the browser finds a nonce so that
// SHA-256("<salt>:<nonce>") starts with `bits` zero bits. At 16 bits that is about 65,000
// hashes, a second or two in the background while the wallet asks to sign, and it makes
// creating workspaces by the thousand cost real compute. Checking it costs one hash.
const proofOfWork = {
  verify(salt, nonce, bits) {
    if (!bits) return true;
    if (typeof nonce !== 'string' || !/^\d{1,16}$/.test(nonce)) return false;
    return leadingZeroBits(crypto.createHash('sha256').update(`${salt}:${nonce}`).digest()) >= bits;
  },

  // Used by tests and by anyone scripting sign-ups for themselves.
  solve(salt, bits) {
    for (let n = 0; ; n++) if (proofOfWork.verify(salt, String(n), bits)) return String(n);
  },
};

export default proofOfWork;
