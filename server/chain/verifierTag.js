import crypto from 'node:crypto';

// The seal Nil's verifier puts on every answer, and the app checks: the verdict, the exact
// request and the exact reply, under a key only the two of them hold. An Ethereum node or a
// proxy on the way can't make one, so an answer that went around the verifier is never taken
// for one it checked. Lengths go in first, so no two different inputs share a seal.
export default function verifierTag(key, verdict, request, reply) {
  return crypto
    .createHmac('sha256', key)
    .update(`nil/verifier/v1\n${verdict}\n${request.length}:${request}\n${reply.length}:${reply}`)
    .digest('hex');
}
