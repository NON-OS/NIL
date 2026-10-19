import config from '../../config.js';
import readSeal from '../readSeal.js';

let nextId = 1;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One request to Nil's verifier at NOX_VERIFIER_URL, for a shadow check. The reply counts only
// with a seal that fits; anything else comes back as { verdict: null } with why: "unreachable"
// (no answer at all) or "no-seal" (an answer without a seal that fits), which a shadow check
// treats as "couldn't check", never as an answer. A verifier that says it's busy is asked once
// more after NOX_VERIFIER_SHADOW_RETRY_MS, since a burst of reads is the usual reason.
export default async function verifierAsk(method, params, { retried = false } = {}) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  let res;
  let text;
  try {
    res = await fetch(config.verification.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request,
      redirect: 'error',
      signal: AbortSignal.timeout(config.nox.rpcTimeoutMs),
    });
    text = await res.text();
  } catch {
    return { verdict: null, why: 'unreachable' };
  }
  const verdict = res.ok ? readSeal(res.headers.get('nil-verification'), request, text) : null;
  if (!verdict) return { verdict: null, why: 'no-seal' };
  let reply;
  try {
    reply = JSON.parse(text);
  } catch {
    return { verdict: null, why: 'no-seal' };
  }
  if (verdict === 'unverified' && reply.error?.data?.reason === 'busy' && !retried) {
    await pause(config.verification.shadowRetryMs);
    return verifierAsk(method, params, { retried: true });
  }
  return { verdict, result: reply.result, error: reply.error };
}
