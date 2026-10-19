const WORD = /^[a-z][a-z-]{0,23}$/;

// What a shadow check concludes from a verifier answer that isn't proven: "differs" when the
// verifier itself caught its node in a false answer, otherwise the reason it couldn't check, so
// the log can say which. That is the verifier's own word (syncing, busy, timeout, out-of-range,
// upstream, checkpoint), or "unreachable" and "no-seal" when no sealed answer came back at all.
export default function unproven(answer) {
  const reason = answer.error?.data?.reason;
  if (answer.verdict === 'unverified' && reason === 'mismatch') return 'differs';
  if (answer.verdict === null) return { reason: answer.why ?? 'unreachable' };
  return { reason: WORD.test(String(reason)) ? reason : 'refused' };
}
