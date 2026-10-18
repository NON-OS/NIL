import crypto from 'node:crypto';
import config from '../config.js';
import verifierTag from './verifierTag.js';
import relayedRead from './relayedRead.js';
import rpcRefusal from './rpcRefusal.js';
import unverified from './unverified.js';
import verifyHealth from './verifyHealth.js';

const VERDICT = /^(proven|absent|relayed|unverified) ([0-9a-f]{64})$/;

function sealed(header, request, text) {
  const match = VERDICT.exec(String(header ?? '').trim());
  if (!match) return null;
  const expected = Buffer.from(verifierTag(config.verification.key, match[1], request, text), 'hex');
  return crypto.timingSafeEqual(expected, Buffer.from(match[2], 'hex')) ? match[1] : null;
}

// The result of one JSON-RPC reply under verified reads, or an error. Only an answer the
// verifier sealed counts, and only with the verdict the method calls for: proven for every read
// Nil acts on, "absent" only for a receipt that isn't there (which proves nothing, so callers
// wait rather than conclude), "relayed" only for what chain/relayedRead.js lets through.
export default function sealedResult(method, params, request, text, header, reply) {
  const verdict = sealed(header, request, text);
  if (!verdict) throw unverified('unsealed');
  if (verdict === 'unverified') throw unverified(reply.error?.data?.reason ?? 'unsupported');
  if (verdict === 'relayed') {
    if (!relayedRead(method, params)) throw unverified('unsealed');
    if (reply.error) throw rpcRefusal(reply.error);
    return reply.result;
  }
  if (verdict === 'absent' && (method !== 'eth_getTransactionReceipt' || reply.result !== null)) throw unverified('unsealed');
  verifyHealth.proven();
  if (reply.error) throw rpcRefusal(reply.error);
  return reply.result;
}
