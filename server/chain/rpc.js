import config from '../config.js';
import HttpError from '../lib/HttpError.js';

let nextId = 1;

const unreachable = (detail) => new HttpError(502, `Nil couldn’t reach its Ethereum node (${detail}). Try again in a minute.`);

// One JSON-RPC call to the node in NOX_RPC_URL. No cookies, no redirects, and a hard
// timeout so a slow node can't hold requests open.
export default async function rpc(method, params = [], { timeoutMs = 10_000 } = {}) {
  let res;
  try {
    res = await fetch(config.nox.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw unreachable('no answer');
  }
  if (!res.ok) throw unreachable(`HTTP ${res.status}`);
  const reply = await res.json().catch(() => null);
  if (!reply || typeof reply !== 'object') throw unreachable('unreadable reply');
  // the node answered but said no (a reverted call, a transaction short of gas): pass its reason
  // on, marked so callers can tell a refusal from a node they couldn't reach
  if (reply.error) throw Object.assign(new HttpError(502, `The Ethereum node refused: ${String(reply.error.message ?? 'no reason given').slice(0, 160)}`), { refused: true });
  return reply.result;
}
