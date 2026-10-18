// Why Helios couldn't prove an answer, in a word the app can act on:
//   mismatch      the execution node's answer didn't match the signed chain: a lying or broken node
//   out-of-range  the block is older than the ~27 hours the chain keeps hashes for (EIP-2935), or not there yet
//   upstream      the execution node failed, timed out or keeps no state proofs for that block
//   syncing       the light client fell behind the beacon chain
//   checkpoint    the checkpoint is too old to start from
const RULES = [
  [/EIP-2935|ring buffer|block not found/i, 'out-of-range'],
  [/checkpoint is too old/i, 'checkpoint'],
  [/out of sync|not synced|still syncing/i, 'syncing'],
  [/server returned|error sending|proof window|connection|timed out|fetch failed/i, 'upstream'],
  [/mismatch|invalid (account|storage|receipt|execution|sync|finality|header)|could not prove|missing log|not included|does not match|validation failed/i, 'mismatch'],
];

export default function heliosFailure(err) {
  const message = String(err?.message ?? err);
  for (const [pattern, reason] of RULES) if (pattern.test(message)) return reason;
  return 'upstream';
}
