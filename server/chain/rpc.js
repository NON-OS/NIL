import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rpcHealth from './rpcHealth.js';
import rpcRefusal from './rpcRefusal.js';
import sealedResult from './sealedResult.js';
import verifyHealth from './verifyHealth.js';
import shadowCheck from './shadowCheck.js';
import relayedRead from './relayedRead.js';

let nextId = 1;

function unreachable(detail) {
  if (config.verification.required) verifyHealth.failed('unreachable');
  return new HttpError(502, `Nil couldn’t reach its Ethereum node (${detail}). Try again in a minute.`);
}

// One JSON-RPC call to the node in NOX_RPC_URL. No cookies, no redirects, and a hard
// timeout so a slow node can't hold requests open. With NOX_VERIFIER_MODE=enforce the answer
// only counts when Nil's verifier sealed it (chain/sealedResult.js); with shadow it is used as
// it comes and checked through the verifier on the side (chain/shadowCheck.js).
export default async function rpc(method, params = [], { timeoutMs = config.nox.rpcTimeoutMs, shadow = true } = {}) {
  const request = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  let res;
  try {
    res = await fetch(config.nox.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    rpcHealth.failed();
    throw unreachable('no answer');
  }
  const text = await res.text().catch(() => '');
  let reply = null;
  try {
    reply = JSON.parse(text);
  } catch {
    // unreadable, handled below
  }
  if (!res.ok) {
    // gateways in front of public nodes say why in the body, like "Archive requests require a
    // personal token" for an old block. A 4xx with a reason is the node refusing, not missing.
    if (reply?.error && res.status < 500 && res.status !== 429 && !config.verification.required) {
      rpcHealth.answered();
      throw rpcRefusal(reply.error, res.status);
    }
    rpcHealth.failed();
    throw unreachable(`HTTP ${res.status}${reply?.error?.message ? `: ${String(reply.error.message).slice(0, 120)}` : ''}`);
  }
  if (!reply || typeof reply !== 'object') {
    rpcHealth.failed();
    throw unreachable('unreadable reply');
  }
  rpcHealth.answered();
  if (config.verification.required) return sealedResult(method, params, request, text, res.headers.get('nil-verification'), reply);
  const watched = shadow && config.verification.shadow && !relayedRead(method, params);
  const node = (m, p) => rpc(m, p, { timeoutMs, shadow: false });
  if (reply.error) {
    const refused = rpcRefusal(reply.error);
    if (watched && refused.reverted) shadowCheck(method, params, { reverted: true }, node);
    throw refused;
  }
  if (watched) shadowCheck(method, params, { result: reply.result }, node);
  return reply.result;
}
