import fileTarget from './fileTarget.js';
import s3Target from './s3Target.js';

// Where encrypted backups go. Both kinds receive ciphertext only.
export default function createTarget(target) {
  if (!target) return null;
  return target.kind === 's3' ? s3Target(target) : fileTarget(target);
}
