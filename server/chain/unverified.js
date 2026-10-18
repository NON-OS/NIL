import HttpError from '../lib/HttpError.js';
import verifyHealth from './verifyHealth.js';

const WHY = {
  unreachable: 'its verifier didn’t answer',
  unsealed: 'the answer didn’t come through Nil’s verifier',
  syncing: 'the verifier is still catching up with the chain',
  checkpoint: 'the verifier’s checkpoint is too old to trust',
  consensus: 'the verifier can’t reach its consensus node',
  mismatch: 'the Ethereum node’s answer didn’t match the chain',
  upstream: 'the Ethereum node didn’t give an answer that could be proven',
  timeout: 'the check took too long',
  busy: 'the verifier is busy',
  'out-of-range': 'the block is older than the verifier can check, about 27 hours',
  unsupported: 'the verifier doesn’t prove that kind of read',
};

// The error for a chain read that couldn't be verified, noted for the admins' notice on the way.
// It is never a "no": callers that turn a
// node's refusal into an answer (a revert read as zero, a signature read as invalid) check
// `refused` or `reverted`, and this has neither, so it can only ever make something wait.
export default function unverified(reason) {
  const why = WHY[reason] ? reason : 'upstream';
  verifyHealth.failed(why);
  return Object.assign(new HttpError(503, `Nil couldn’t verify what its Ethereum node said: ${WHY[why]}. Nothing is counted or refused on it; Nil tries again by itself.`), { unverified: true, reason: why });
}
