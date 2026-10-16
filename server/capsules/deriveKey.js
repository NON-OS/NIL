import crypto from 'node:crypto';

// scrypt with N=2^17: about half a second per guess on a laptop, which makes offline
// passphrase guessing against a stolen capsule very expensive.
export default function deriveKey(passphrase, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(passphrase).normalize('NFKC'), salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
