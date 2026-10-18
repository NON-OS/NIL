import envNumber from '../lib/envNumber.js';
import refuseToStart from '../lib/refuseToStart.js';
import units from './units.js';

const key = (process.env.NOX_VERIFIER_KEY ?? '').trim();
if (key && key.length < 32) refuseToStart('NOX_VERIFIER_KEY must be at least 32 characters, the same value Nil’s verifier has as VERIFIER_KEY. Make one with: openssl rand -hex 32');

// Verified chain reads. With NOX_VERIFIER_KEY set, NOX_RPC_URL must be Nil's verifier
// (server/verifier, or Caddy's relay to it), and every chain read the server acts on has to come
// back sealed with this key and proven. Anything else is treated as "can't verify right now":
// payments wait, votes don't open, nobody is let in or turned away on it.
export default Object.freeze({
  required: Boolean(key),
  key: key || null,
  // EIP-2935 keeps the hashes of the last 8,191 blocks (about 27 hours) in state, and the
  // verifier can prove nothing older
  historyBlocks: 8191,
  // an answer that failed its proof means the node said something false; admins keep seeing
  // that this long, even while later answers check out
  mismatchNoticeMs: envNumber('NOX_VERIFY_MISMATCH_HOURS', 24, { min: 1 }) * units.HOUR,
});
