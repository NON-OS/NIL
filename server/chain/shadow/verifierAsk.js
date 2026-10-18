import config from '../../config.js';
import readSeal from '../readSeal.js';

let nextId = 1;

// One request to Nil's verifier at NOX_VERIFIER_URL, for a shadow check. The reply counts only
// with a seal that fits; anything else (no answer, no seal, a forged one) comes back as
// { verdict: null }, which a shadow check treats as "couldn't check", never as an answer.
export default async function verifierAsk(method, params) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  try {
    const res = await fetch(config.verification.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request,
      redirect: 'error',
      signal: AbortSignal.timeout(config.nox.rpcTimeoutMs),
    });
    const text = await res.text();
    const verdict = res.ok ? readSeal(res.headers.get('nil-verification'), request, text) : null;
    if (!verdict) return { verdict: null };
    const reply = JSON.parse(text);
    return { verdict, result: reply.result, error: reply.error };
  } catch {
    return { verdict: null };
  }
}
