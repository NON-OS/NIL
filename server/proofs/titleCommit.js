import crypto from 'node:crypto';

// A salted hash of the task title. The receipt holds only this; the contributor keeps the
// salt and can later prove the title without anyone being able to guess it from the hash.
export default function titleCommit(title) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, commit: crypto.createHash('sha256').update(`${salt}:${title}`, 'utf8').digest('hex') };
}
