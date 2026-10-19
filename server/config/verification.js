import envNumber from '../lib/envNumber.js';
import envUrl from './envUrl.js';
import configWarning from '../lib/configWarning.js';
import refuseToStart from '../lib/refuseToStart.js';
import log from '../lib/log.js';
import units from './units.js';

const MODES = ['off', 'shadow', 'enforce'];
const env = process.env;
const key = (env.NOX_VERIFIER_KEY ?? '').trim();
const url = envUrl('NOX_VERIFIER_URL');
if (key && key.length < 32) refuseToStart('NOX_VERIFIER_KEY must be at least 32 characters, the same value Nil’s verifier has as VERIFIER_KEY. Make one with: openssl rand -hex 32');

function mode(raw) {
  const value = (raw ?? '').trim().toLowerCase() || 'off';
  if (!MODES.includes(value)) {
    configWarning(`NOX_VERIFIER_MODE=${value} isn’t off, shadow or enforce. Using off.`);
    return 'off';
  }
  if (value === 'enforce' && !key) refuseToStart('NOX_VERIFIER_MODE=enforce needs NOX_VERIFIER_KEY, the key Nil’s verifier seals its answers with, and NOX_RPC_URL pointing at the verifier.');
  if (value === 'shadow' && (!key || !url)) {
    // not a config warning: shadow is the hosted default, and a server without a verifier yet
    // still has to start, even with STRICT_CONFIG
    log.warn('config', `NOX_VERIFIER_MODE=shadow needs NOX_VERIFIER_KEY and NOX_VERIFIER_URL; without ${key ? 'the URL' : 'the key'} chain reads aren’t checked at all.`);
    return 'off';
  }
  return value;
}

// Verified chain reads, through Nil's verifier (server/verifier).
//   off      the server believes its Ethereum node, as it always has
//   shadow   it still acts on the node's answers, and checks each one through the verifier at
//            NOX_VERIFIER_URL as it goes: an answer the verifier proves false raises the admins'
//            notice and an error in the log; one it can't check is only logged; nothing waits
//   enforce  NOX_RPC_URL is the verifier and every read the server acts on has to come back
//            sealed and proven. Anything else counts as "can't verify right now": payments wait,
//            votes don't open, nobody is let in or turned away on it
const effective = mode(env.NOX_VERIFIER_MODE);

export default Object.freeze({
  mode: effective,
  required: effective === 'enforce',
  shadow: effective === 'shadow',
  key: key || null,
  url,
  // EIP-2935 keeps the hashes of the last 8,191 blocks (about 27 hours) in state, and the
  // verifier can prove nothing older
  historyBlocks: 8191,
  // an answer that failed its proof means the node said something false; admins keep seeing
  // that this long, even while later answers check out
  mismatchNoticeMs: envNumber('NOX_VERIFY_MISMATCH_HOURS', 24, { min: 1 }) * units.HOUR,
  // shadow checks running at once; past that a read goes unchecked rather than queueing
  shadowMax: envNumber('NOX_VERIFIER_SHADOW_MAX', 8, { min: 1 }),
  // how long a shadow check waits before asking a busy verifier once more
  shadowRetryMs: envNumber('NOX_VERIFIER_SHADOW_RETRY_MS', 2000, { min: 0, max: 60_000 }),
});
