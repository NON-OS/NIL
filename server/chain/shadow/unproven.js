// What a shadow check concludes from a verifier answer that isn't proven: "differs" when the
// verifier itself caught its node in a false answer, "unknown" for everything else (not
// reachable, still syncing, a block too old to prove).
export default function unproven(answer) {
  return answer.verdict === 'unverified' && answer.error?.data?.reason === 'mismatch' ? 'differs' : 'unknown';
}
